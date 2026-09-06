import type { DeepReadonly } from "../../content/content-validation";
import type { Mission, Phrase } from "../../domain/content-schema";
import { normalizeTranscript, scoreTranscript } from "../../domain/functional-score";
import {
  completeExercise,
  nextExercise,
  recordPhraseAttempt,
  type AttemptClass,
  type LessonDefinition,
  type LessonState,
  type SupportLevel
} from "../../domain/lesson-engine";
import type { LearnerProgressV1 } from "../../domain/progress";
import type { RecognitionResult, RecordingSession, SpeechPort } from "../../speech/speech-port";
import type { SaveExerciseResultInput } from "../../storage/progress-repository";

export interface LessonPersistence {
  saveExerciseResult(input: SaveExerciseResultInput): Promise<unknown>;
}

export interface LessonView extends HTMLElement {
  dispose(): Promise<void>;
}

export interface LessonViewOptions {
  mission: DeepReadonly<Mission>;
  progress: LearnerProgressV1;
  speech: SpeechPort;
  persistence: LessonPersistence;
  now?: () => number;
  onComplete?: () => void;
  createObjectURL?: (recording: Blob) => string;
  revokeObjectURL?: (url: string) => void;
  createAttemptId?: () => string;
  createEventId?: () => string;
}

let fallbackIdSequence = 0;

function generatedId(label: string): string {
  try {
    if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
    const values = new Uint32Array(4);
    crypto.getRandomValues(values);
    return `${label}-${[...values].map((value) => value.toString(36)).join("-")}`;
  } catch {
    fallbackIdSequence += 1;
    return `${label}-${Date.now().toString(36)}-${fallbackIdSequence.toString(36)}`;
  }
}

const stageMap = "active-review comprehension supported-speaking prompt-free-role-play reading-close";
type Stage =
  | "active-review"
  | "comprehension"
  | "supported-speaking"
  | "prompt-free-role-play"
  | "reading-close";

const stageLabels: Record<Stage, string> = {
  "active-review": "主动复习",
  comprehension: "听懂意思",
  "supported-speaking": "开口练习",
  "prompt-free-role-play": "无提示情境",
  "reading-close": "阅读收尾"
};

function stageFor(type: Mission["exercises"][number]["type"], index: number): Stage {
  if (type === "intent") return "active-review";
  if (type === "roleplay") return "prompt-free-role-play";
  if (type === "reading") return "reading-close";
  if (type === "shadow" && index === 1) return "comprehension";
  return "supported-speaking";
}

function supportFor(
  type: Mission["exercises"][number]["type"],
  baseline: SupportLevel
): SupportLevel {
  if (type === "roleplay") return "prompt-only";
  if (type === "recall") {
    return baseline === "full" || baseline === "english" ? "partial" : "prompt-only";
  }
  return baseline === "prompt-only" ? "partial" : baseline;
}

function hintCountFor(support: SupportLevel): number {
  if (support === "prompt-only") return 0;
  if (support === "full") return 2;
  return 1;
}

function choiceField(
  values: readonly { value: string; label: string }[],
  name: string
): HTMLFieldSetElement {
  const fieldset = document.createElement("fieldset");
  const legend = document.createElement("legend");
  legend.textContent = "选择后继续";
  fieldset.append(legend);
  for (const option of values) {
    const label = document.createElement("label");
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = name;
    radio.value = option.value;
    label.append(radio, document.createTextNode(option.label));
    fieldset.append(label);
  }
  return fieldset;
}

function phraseFor(
  mission: DeepReadonly<Mission>,
  phraseId: string | undefined
): DeepReadonly<Phrase> | undefined {
  return phraseId
    ? mission.productionPhrases.find((phrase) => phrase.id === phraseId)
    : undefined;
}

function latestAttemptClass(state: LessonState): AttemptClass | undefined {
  return Object.values(state.phraseClasses).at(-1);
}

function restoreAttempts(
  attempts: NonNullable<LearnerProgressV1["sessions"][string]["phraseAttempts"]> | undefined
): LessonState["phraseAttempts"] {
  return Object.fromEntries(Object.entries(attempts ?? {}).map(([phraseId, history]) => [
    phraseId,
    history.map((attempt) => ({
      supportLevel: attempt.supportLevel,
      ...(attempt.attemptId === undefined ? {} : { attemptId: attempt.attemptId }),
      passed: attempt.passed,
      answerRevealed: attempt.answerRevealed,
      ...(attempt.hintCount === undefined ? {} : { hintCount: attempt.hintCount }),
      ...(attempt.timestamp === undefined ? {} : { timestamp: attempt.timestamp }),
      ...(attempt.activity === undefined ? {} : { activity: attempt.activity })
    }))
  ]));
}

function answerMatches(answer: string, expectedAnswers: readonly string[]): boolean {
  const normalized = normalizeTranscript(answer);
  return normalized.length > 0 && expectedAnswers.some((expected) => {
    const normalizedExpected = normalizeTranscript(expected);
    if (normalized === normalizedExpected || normalized.includes(normalizedExpected)) return true;
    const answerTokens = normalized.split(" ").filter((token) => token.length > 1);
    const expectedTokens = new Set(normalizedExpected.split(" "));
    return answerTokens.length >= 2 && answerTokens.every((token) => expectedTokens.has(token));
  });
}

function defaultNavigation(root: HTMLElement): void {
  root.dispatchEvent(new CustomEvent("app:navigate", {
    bubbles: true,
    detail: { href: "#/home" }
  }));
}

export function renderLesson(options: LessonViewOptions): LessonView {
  const { mission, progress, speech, persistence } = options;
  const now = options.now ?? Date.now;
  const createAttemptId = options.createAttemptId ?? (() => generatedId("attempt"));
  const createEventId = options.createEventId ?? (() => generatedId("event"));
  const baselineSupport = progress.calibration?.supportLevel ?? "full";
  const definition: LessonDefinition = {
    exerciseIds: mission.exercises.map((exercise) => exercise.id),
    phraseIds: mission.productionPhrases.map((phrase) => phrase.id)
  };
  const restoredSession = progress.sessions[mission.id];
  let state: LessonState = {
    completedExerciseIds: [...(restoredSession?.completedExerciseIds ?? [])],
    phraseAttempts: restoreAttempts(restoredSession?.phraseAttempts),
    phraseClasses: { ...(restoredSession?.phraseClasses ?? {}) }
  };
  nextExercise(definition, state);

  let speakingSeconds = progress.speakingSeconds;
  let exerciseSpeakingSeconds = 0;
  let lastAttemptClass = latestAttemptClass(state);
  let saveError: string | undefined;
  let activeReviewRevealed = false;
  let readingChecked = false;
  let readingPassed = false;
  let recording: RecordingSession | undefined;
  let recordingStartedAt = 0;
  let recordingBlob: Blob | undefined;
  let recordingUrl: string | undefined;
  let recognitionResult: Promise<RecognitionResult | null> | undefined;
  let speechPhase: "idle" | "recording" | "assessed" | "self-rating" = "idle";
  let recognizedPass = false;
  let disposed = false;
  let pendingCompletion: {
    exerciseId: string;
    completedState: LessonState;
    candidateClass?: AttemptClass | undefined;
    speakingSecondsDelta: number;
    payload: SaveExerciseResultInput;
  } | undefined;

  const root = document.createElement("section") as LessonView;
  root.className = "lesson-view";
  root.dataset.stageMap = stageMap;
  root.setAttribute("aria-live", "polite");

  const playWithFeedback = (play: () => Promise<void>): void => {
    let status = root.querySelector<HTMLElement>("[data-playback-status]");
    if (!status) {
      status = document.createElement("p");
      status.dataset.playbackStatus = "true";
      root.append(status);
    }
    status.setAttribute("role", "status");
    status.textContent = "正在播放…";
    try {
      void play().then(() => {
        if (disposed) return;
        status!.setAttribute("role", "status");
        status!.textContent = "播放完成。";
      }).catch(() => {
        if (disposed) return;
        status!.setAttribute("role", "alert");
        status!.textContent = "播放失败，请稍后重试。";
      });
    } catch {
      status.setAttribute("role", "alert");
      status.textContent = "播放失败，请稍后重试。";
    }
  };

  const releaseRecordingUrl = (): void => {
    if (!recordingUrl) return;
    (options.revokeObjectURL ?? URL.revokeObjectURL)?.(recordingUrl);
    recordingUrl = undefined;
  };

  const persistCompletion = async (
    exerciseId: string,
    candidateState: LessonState,
    candidateClass?: AttemptClass
  ): Promise<boolean> => {
    if (!pendingCompletion) {
      const speakingSecondsDelta = exerciseSpeakingSeconds;
      const completedState = completeExercise(definition, candidateState, exerciseId);
      const previousAttemptIds = new Set(Object.values(state.phraseAttempts)
        .flat().map((attempt) => attempt.attemptId).filter((id): id is string => id !== undefined));
      const newAttempt = Object.entries(completedState.phraseAttempts)
        .flatMap(([phraseId, history]) => history.map((attempt) => ({ phraseId, attempt })))
        .find(({ attempt }) => attempt.attemptId !== undefined && !previousAttemptIds.has(attempt.attemptId));
      const exercise = mission.exercises.find((item) => item.id === exerciseId);
      pendingCompletion = {
        exerciseId,
        completedState,
        candidateClass,
        speakingSecondsDelta,
        payload: {
          missionId: mission.id,
          exerciseId,
          eventId: createEventId(),
          lessonState: completedState,
          speakingSecondsDelta,
          speakingSeconds: speakingSeconds + speakingSecondsDelta,
          ...(newAttempt?.attempt.attemptId && newAttempt.attempt.timestamp ? {
            attemptEvent: {
              attemptId: newAttempt.attempt.attemptId,
              phraseId: newAttempt.phraseId,
              missionId: mission.id,
              ...(exercise?.type === "roleplay" ? { scenarioId: exercise.id } : {}),
              hintUsed: (newAttempt.attempt.hintCount ?? 0) > 0,
              occurredAt: newAttempt.attempt.timestamp
            }
          } : {})
        }
      };
    }
    if (pendingCompletion.exerciseId !== exerciseId) {
      throw new Error("A different exercise completion is still pending");
    }
    const pending = pendingCompletion;
    let savedProgress: unknown;
    try {
      savedProgress = await persistence.saveExerciseResult(pending.payload);
    } catch {
      saveError = "未能保存，本题还在这里。请检查存储空间后重试。";
      return false;
    }
    if (disposed) return false;
    state = pending.completedState;
    const savedSpeakingSeconds = savedProgress
      && typeof savedProgress === "object"
      && "speakingSeconds" in savedProgress
      && typeof savedProgress.speakingSeconds === "number"
      ? savedProgress.speakingSeconds
      : undefined;
    speakingSeconds = savedSpeakingSeconds ?? speakingSeconds + pending.speakingSecondsDelta;
    exerciseSpeakingSeconds = 0;
    lastAttemptClass = pending.candidateClass ?? latestAttemptClass(pending.completedState);
    pendingCompletion = undefined;
    saveError = undefined;
    activeReviewRevealed = false;
    readingChecked = false;
    readingPassed = false;
    speechPhase = "idle";
    recording = undefined;
    recordingBlob = undefined;
    recognitionResult = undefined;
    recognizedPass = false;
    return true;
  };

  const render = (): void => {
    if (disposed) return;
    releaseRecordingUrl();
    root.replaceChildren();
    if (lastAttemptClass) root.dataset.lastAttemptClass = lastAttemptClass;
    else delete root.dataset.lastAttemptClass;

    const index = state.completedExerciseIds.length;
    const heading = document.createElement("h1");
    heading.tabIndex = -1;
    if (index >= mission.exercises.length) {
      root.dataset.stage = "reading-close";
      heading.textContent = `${mission.titleZh}完成`;
      const summary = document.createElement("p");
      summary.textContent =
        `已练习；独立完成三次并通过无提示复习后才会显示“已掌握”。口语 ${Math.round(speakingSeconds)} 秒。`;
      const primary = document.createElement("button");
      primary.type = "button";
      primary.className = "primary-action";
      primary.textContent = "返回今日任务";
      primary.addEventListener("click", () => {
        if (options.onComplete) options.onComplete();
        else defaultNavigation(root);
      });
      root.append(heading, summary, primary);
      queueMicrotask(() => heading.focus());
      return;
    }

    const exercise = mission.exercises[index]!;
    const phrase = phraseFor(mission, exercise.phraseId);
    const stage = stageFor(exercise.type, index);
    root.dataset.stage = stage;
    heading.textContent = stageLabels[stage];
    const prompt = document.createElement("p");
    prompt.textContent = exercise.promptZh;
    const primary = document.createElement("button");
    primary.type = "button";
    primary.className = "primary-action";
    root.append(heading, prompt);

    if (saveError) {
      const error = document.createElement("p");
      error.setAttribute("role", "alert");
      error.textContent = saveError;
      root.append(error);
    }
    if (lastAttemptClass) {
      const status = document.createElement("p");
      status.className = "attempt-status";
      status.textContent = lastAttemptClass === "mastered"
        ? "已掌握"
        : lastAttemptClass === "recalled" ? "已独立回想" : "已练习";
      root.append(status);
    }

    if (stage === "active-review") {
      if (!activeReviewRevealed) {
        const cue = document.createElement("p");
        cue.textContent = phrase?.chinese ?? "先想一想这句话怎么说。";
        root.append(cue);
        primary.textContent = "显示答案";
        primary.addEventListener("click", () => {
          activeReviewRevealed = true;
          render();
        });
      } else {
        if (phrase) {
          const answer = document.createElement("p");
          answer.lang = "en";
          answer.textContent = phrase.english;
          const listen = document.createElement("button");
          listen.type = "button";
          listen.className = "secondary-action";
          listen.textContent = "播放答案";
          listen.addEventListener("click", () => playWithFeedback(() => speech.speak(phrase.english, 1)));
          root.append(answer, listen);
        }
        const rating = choiceField([
          { value: "recalled", label: "想起来了" },
          { value: "retry", label: "需要再练" }
        ], `active-review-${exercise.id}`);
        root.append(rating);
        primary.textContent = "确认";
        primary.addEventListener("click", async () => {
          primary.disabled = true;
          if (pendingCompletion) {
            await persistCompletion(exercise.id, state);
            render();
            return;
          }
          const selected = rating.querySelector<HTMLInputElement>('input[type="radio"]:checked');
          if (!selected) {
            primary.disabled = false;
            return;
          }
          let candidateState = state;
          let candidateClass: AttemptClass | undefined;
          if (phrase) {
            candidateState = recordPhraseAttempt(definition, state, phrase.id, {
              attemptId: createAttemptId(),
              passed: selected.value === "recalled",
              answerRevealed: true,
              supportLevel: "full",
              hintCount: 2,
              timestamp: new Date(now()).toISOString(),
              activity: "production"
            });
            candidateClass = candidateState.phraseClasses[phrase.id];
          }
          await persistCompletion(exercise.id, candidateState, candidateClass);
          render();
        });
      }
    } else if (stage === "comprehension") {
      if (phrase) {
        const listen = document.createElement("button");
        listen.type = "button";
        listen.className = "secondary-action";
        listen.textContent = "播放英文";
        listen.addEventListener("click", () => playWithFeedback(() => speech.speak(phrase.english, 1)));
        root.append(listen);
      }
      const choices = choiceField([
        { value: "answer", label: phrase?.intent ?? "这句话的用途" },
        { value: "other", label: "其他意思" }
      ], `comprehension-${exercise.id}`);
      root.append(choices);
      primary.textContent = "继续";
      primary.addEventListener("click", async () => {
        primary.disabled = true;
        if (pendingCompletion) {
          await persistCompletion(exercise.id, state);
          render();
          return;
        }
        const selected = choices.querySelector<HTMLInputElement>('input[type="radio"]:checked');
        if (!selected) {
          primary.disabled = false;
          return;
        }
        let candidateState = state;
        let candidateClass: AttemptClass | undefined;
        if (phrase) {
          candidateState = recordPhraseAttempt(definition, state, phrase.id, {
            attemptId: createAttemptId(),
            passed: selected.value === "answer",
            answerRevealed: true,
            supportLevel: "full",
            hintCount: 1,
            timestamp: new Date(now()).toISOString(),
            activity: "choice"
          });
          candidateClass = candidateState.phraseClasses[phrase.id];
        }
        await persistCompletion(exercise.id, candidateState, candidateClass);
        render();
      });
    } else if (stage === "reading-close" && exercise.type === "reading") {
      const passage = document.createElement("p");
      passage.lang = "en";
      passage.textContent = exercise.readingText;
      root.append(passage);
      if (!readingChecked) {
        for (const question of exercise.questions) {
          const label = document.createElement("label");
          label.dataset.readingQuestion = question.id;
          label.textContent = question.promptZh;
          const input = document.createElement("input");
          input.type = "text";
          input.autocomplete = "off";
          input.dataset.expectedAnswers = JSON.stringify(question.expectedAnswers);
          label.append(input);
          root.append(label);
        }
        primary.textContent = "检查答案";
        primary.addEventListener("click", () => {
          const answers = [...root.querySelectorAll<HTMLInputElement>("[data-reading-question] input")];
          readingPassed = answers.every((input) => answerMatches(
            input.value,
            JSON.parse(input.dataset.expectedAnswers ?? "[]") as string[]
          ));
          readingChecked = true;
          render();
        });
      } else {
        const feedback = document.createElement("p");
        feedback.textContent = readingPassed ? "读懂了关键信息。" : "再看一眼答案，然后带着意思读一遍。";
        root.append(feedback);
        if (!readingPassed) {
          for (const question of exercise.questions) {
            const answer = document.createElement("p");
            answer.textContent = `${question.promptZh} ${question.expectedAnswers.join(" / ")}`;
            root.append(answer);
          }
        }
        primary.textContent = "完成阅读";
        primary.addEventListener("click", async () => {
          primary.disabled = true;
          if (pendingCompletion) {
            await persistCompletion(exercise.id, state);
            render();
            return;
          }
          let candidateState = state;
          let candidateClass: AttemptClass | undefined;
          if (phrase) {
            candidateState = recordPhraseAttempt(definition, state, phrase.id, {
              attemptId: createAttemptId(),
              passed: readingPassed,
              answerRevealed: !readingPassed,
              supportLevel: "english",
              hintCount: readingPassed ? 0 : 1,
              timestamp: new Date(now()).toISOString(),
              activity: "choice"
            });
            candidateClass = candidateState.phraseClasses[phrase.id];
          }
          await persistCompletion(exercise.id, candidateState, candidateClass);
          render();
        });
      }
    } else {
      const support = supportFor(exercise.type, baselineSupport);
      if (stage === "prompt-free-role-play") {
        const cue = document.createElement("p");
        const variation = exercise.type === "roleplay"
          ? Object.values(exercise.variation).join("；")
          : "";
        cue.textContent = `情境提示：根据眼前情况独立把事情办成。任务变化：${variation}`;
        root.append(cue);
      } else if (phrase) {
        const english = document.createElement("p");
        english.lang = "en";
        english.textContent = support === "partial"
          ? phrase.keywords.join(" · ")
          : support === "prompt-only" ? "先按情境自己组织一句话。" : phrase.english;
        const chinese = document.createElement("p");
        chinese.textContent = phrase.chinese;
        const listen = document.createElement("button");
        listen.type = "button";
        listen.className = "secondary-action";
        listen.textContent = "听示范";
        listen.setAttribute("aria-label", `播放示范：${phrase.english}`);
        listen.addEventListener("click", () => playWithFeedback(() => speech.speak(phrase.english, 1)));
        root.append(english);
        if (support === "full") root.append(chinese);
        if (support !== "prompt-only") root.append(listen);
      }

      if (speechPhase === "idle") {
        primary.textContent = "开始录音";
        primary.addEventListener("click", async () => {
          primary.disabled = true;
          try {
            recording = await speech.startRecording();
            if (disposed) {
              await recording.stop().catch(() => undefined);
              recording = undefined;
              return;
            }
            recordingStartedAt = now();
            const recognitionMode = await speech.recognitionMode().catch(() => "self-rating" as const);
            recognitionResult = recognitionMode === "automatic"
              ? speech.recognize("en-US").catch(() => null)
              : undefined;
            speechPhase = "recording";
          } catch {
            speechPhase = "self-rating";
          }
          render();
        });
      } else if (speechPhase === "recording") {
        primary.textContent = "停止录音";
        primary.addEventListener("click", async () => {
          primary.disabled = true;
          const stoppedAt = now();
          try {
            recordingBlob = await recording!.stop();
            exerciseSpeakingSeconds += Math.max(0, stoppedAt - recordingStartedAt) / 1_000;
          } catch {
            recordingBlob = undefined;
          }
          if (disposed) return;
          const result = await recognitionResult;
          if (result && phrase) {
            recognizedPass = scoreTranscript(result.transcript, {
              requiredKeywords: phrase.requiredKeywordGroups
            }).passed;
            speechPhase = "assessed";
          } else {
            speechPhase = "self-rating";
          }
          render();
        });
      } else {
        let rating: HTMLFieldSetElement | undefined;
        if (speechPhase === "self-rating") {
          const fallback = document.createElement("p");
          fallback.textContent = recordingBlob
            ? "识别没有结果，请回听后自己判断。"
            : "麦克风或识别不可用，可以无声练习后自评。";
          root.append(fallback);
          if (recordingBlob) {
            const audio = document.createElement("audio");
            audio.controls = true;
            audio.setAttribute("aria-label", "回听自己的录音");
            const createObjectURL = options.createObjectURL ?? URL.createObjectURL?.bind(URL);
            if (createObjectURL) {
              recordingUrl = createObjectURL(recordingBlob);
              audio.src = recordingUrl;
            }
            root.append(audio);
          }
          rating = choiceField(
            [{ value: "smooth", label: "说顺了" }, { value: "retry", label: "还不熟" }],
            `rating-${exercise.id}`
          );
          root.append(rating);
        } else {
          const result = document.createElement("p");
          result.textContent = recognizedPass
            ? "意思表达出来了。"
            : "关键词还不完整，算作已练习。";
          root.append(result);
        }
        primary.textContent = "继续";
        primary.addEventListener("click", async () => {
          primary.disabled = true;
          if (pendingCompletion) {
            await persistCompletion(exercise.id, state);
            render();
            return;
          }
          let passed = recognizedPass;
          if (rating) {
            const selected = rating.querySelector<HTMLInputElement>('input[type="radio"]:checked');
            if (!selected) {
              primary.disabled = false;
              return;
            }
            passed = selected.value === "smooth";
          }
          let candidateState = state;
          let candidateClass: AttemptClass | undefined;
          if (phrase) {
            candidateState = recordPhraseAttempt(definition, state, phrase.id, {
              attemptId: createAttemptId(),
              passed,
              answerRevealed: false,
              supportLevel: support,
              hintCount: hintCountFor(support),
              timestamp: new Date(now()).toISOString(),
              activity: "production"
            });
            candidateClass = candidateState.phraseClasses[phrase.id];
          }
          await persistCompletion(exercise.id, candidateState, candidateClass);
          render();
        });
      }
    }
    if (pendingCompletion) primary.textContent = "重试保存";
    root.append(primary);
    queueMicrotask(() => heading.focus());
  };

  render();
  root.dispose = async () => {
    if (disposed) return;
    disposed = true;
    releaseRecordingUrl();
    const activeRecording = recording;
    recording = undefined;
    if (activeRecording && speechPhase === "recording") {
      await activeRecording.stop().catch(() => undefined);
    }
    root.replaceChildren();
  };
  return root;
}
