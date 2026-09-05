import type { DeepReadonly } from "../../content/content-validation";
import type { Mission, Phrase } from "../../domain/content-schema";
import { scoreTranscript } from "../../domain/functional-score";
import {
  completeExercise,
  createLessonState,
  recordPhraseAttempt,
  type AttemptClass,
  type LessonDefinition,
  type LessonState,
  type SupportLevel
} from "../../domain/lesson-engine";
import type { LearnerProgressV1 } from "../../domain/progress";
import type { RecognitionResult, RecordingSession, SpeechPort } from "../../speech/speech-port";

export interface LessonPersistence {
  saveExerciseResult(input: { missionId: string; exerciseId: string }): Promise<unknown> | unknown;
  saveLessonMetrics?(input: { missionId: string; speakingSeconds: number; lessonState: LessonState }): Promise<unknown> | unknown;
}

export interface LessonViewOptions {
  mission: DeepReadonly<Mission>;
  progress: LearnerProgressV1;
  speech: SpeechPort;
  persistence: LessonPersistence;
  now?: () => number;
}

const stageMap = "active-review comprehension supported-speaking prompt-free-role-play reading-close";
type Stage =
  | "active-review"
  | "comprehension"
  | "supported-speaking"
  | "prompt-free-role-play"
  | "reading-close";

function stageFor(type: Mission["exercises"][number]["type"], index: number): Stage {
  if (type === "intent") return "active-review";
  if (type === "roleplay") return "prompt-free-role-play";
  if (type === "reading") return "reading-close";
  if (type === "shadow" && index === 1) return "comprehension";
  return "supported-speaking";
}

function supportFor(type: Mission["exercises"][number]["type"], index: number): SupportLevel {
  if (type === "roleplay") return "prompt-only";
  if (type === "recall") return "partial";
  if (type === "shadow" && index <= 1) return "full";
  return "english";
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
  return phraseId ? mission.productionPhrases.find((phrase) => phrase.id === phraseId) : undefined;
}

export function renderLesson(options: LessonViewOptions): HTMLElement {
  const { mission, progress, speech, persistence } = options;
  const now = options.now ?? Date.now;
  const definition: LessonDefinition = {
    exerciseIds: mission.exercises.map((exercise) => exercise.id),
    phraseIds: mission.productionPhrases.map((phrase) => phrase.id)
  };
  let state = createLessonState();
  const restoredIds = progress.sessions[mission.id]?.completedExerciseIds ?? [];
  for (const exerciseId of restoredIds) state = completeExercise(definition, state, exerciseId);
  let speakingSeconds = progress.speakingSeconds;
  let lastAttemptClass: AttemptClass | undefined;
  let recording: RecordingSession | undefined;
  let recordingStartedAt = 0;
  let recordingBlob: Blob | undefined;
  let recordingUrl: string | undefined;
  let recognitionResult: Promise<RecognitionResult | null> | undefined;
  let speechPhase: "idle" | "recording" | "assessed" | "self-rating" = "idle";
  let recognizedPass = false;
  const root = document.createElement("section");
  root.className = "lesson-view";
  root.dataset.stageMap = stageMap;
  root.setAttribute("aria-live", "polite");

  const persistCompletion = async (exerciseId: string): Promise<void> => {
    state = completeExercise(definition, state, exerciseId);
    await persistence.saveExerciseResult({ missionId: mission.id, exerciseId });
    await persistence.saveLessonMetrics?.({ missionId: mission.id, speakingSeconds, lessonState: state });
  };

  const render = (): void => {
    if (recordingUrl) {
      URL.revokeObjectURL(recordingUrl);
      recordingUrl = undefined;
    }
    root.replaceChildren();
    if (lastAttemptClass) root.dataset.lastAttemptClass = lastAttemptClass;
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
      root.append(heading, summary, primary);
      queueMicrotask(() => heading.focus());
      return;
    }

    const exercise = mission.exercises[index]!;
    const phrase = phraseFor(mission, exercise.phraseId);
    const stage = stageFor(exercise.type, index);
    root.dataset.stage = stage;
    const stageLabels: Record<Stage, string> = {
      "active-review": "主动复习",
      comprehension: "听懂意思",
      "supported-speaking": "开口练习",
      "prompt-free-role-play": "无提示情境",
      "reading-close": "阅读收尾"
    };
    heading.textContent = stageLabels[stage];
    const prompt = document.createElement("p");
    prompt.textContent = exercise.promptZh;
    const primary = document.createElement("button");
    primary.type = "button";
    primary.className = "primary-action";
    root.append(heading, prompt);
    if (lastAttemptClass) {
      const status = document.createElement("p");
      status.className = "attempt-status";
      status.textContent = lastAttemptClass === "mastered"
        ? "已掌握"
        : lastAttemptClass === "recalled" ? "已独立回想" : "已练习";
      root.append(status);
    }

    const isSpeaking = stage === "supported-speaking" || stage === "prompt-free-role-play";
    if (!isSpeaking) {
      if (exercise.type === "reading") {
        const reading = document.createElement("p");
        reading.lang = "en";
        reading.textContent = exercise.readingText;
        root.append(
          reading,
          choiceField([{ value: "read", label: "我找到了关键信息" }], `lesson-${exercise.id}`)
        );
      } else {
        if (phrase) {
          const listen = document.createElement("button");
          listen.type = "button";
          listen.className = "secondary-action";
          listen.textContent = "播放英文";
          listen.addEventListener("click", () => { void speech.playFixed(phrase.audio!, 1); });
          root.append(listen);
        }
        root.append(choiceField([
          { value: "answer", label: phrase?.intent ?? "这句话的用途" },
          { value: "other", label: "其他意思" }
        ], `lesson-${exercise.id}`));
      }
      primary.textContent = "继续";
      primary.addEventListener("click", async () => {
        primary.disabled = true;
        const selected = root.querySelector<HTMLInputElement>('input[type="radio"]:checked');
        if (!selected) {
          primary.disabled = false;
          return;
        }
        if (phrase) {
          state = recordPhraseAttempt(definition, state, phrase.id, {
            passed: selected.value === "answer",
            answerRevealed: true,
            supportLevel: "full",
            activity: "choice"
          });
          lastAttemptClass = state.phraseClasses[phrase.id];
        }
        await persistCompletion(exercise.id);
        render();
      });
    } else {
      const support = supportFor(exercise.type, index);
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
        english.textContent = support === "partial" ? phrase.keywords.join(" · ") : phrase.english;
        root.append(english);
        if (support === "full") {
          const chinese = document.createElement("p");
          chinese.textContent = phrase.chinese;
          root.append(chinese);
        }
        const listen = document.createElement("button");
        listen.type = "button";
        listen.className = "secondary-action";
        listen.textContent = "听示范";
        listen.setAttribute("aria-label", `播放示范：${phrase.english}`);
        listen.addEventListener("click", () => { void speech.playFixed(phrase.audio!, 1); });
        root.append(listen);
      }

      if (speechPhase === "idle") {
        primary.textContent = "开始录音";
        primary.addEventListener("click", async () => {
          primary.disabled = true;
          try {
            recording = await speech.startRecording();
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
            speakingSeconds += Math.max(0, stoppedAt - recordingStartedAt) / 1_000;
          } catch {
            recordingBlob = undefined;
          }
          try {
            const result = await recognitionResult;
            if (result && phrase) {
              recognizedPass = scoreTranscript(result.transcript, {
                requiredKeywords: phrase.requiredKeywordGroups
              }).passed;
              speechPhase = "assessed";
            } else {
              speechPhase = "self-rating";
            }
          } catch {
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
          const audio = document.createElement("audio");
          audio.controls = true;
          audio.setAttribute("aria-label", "回听自己的录音");
          if (recordingBlob && typeof URL.createObjectURL === "function") {
            recordingUrl = URL.createObjectURL(recordingBlob);
            audio.src = recordingUrl;
          }
          rating = choiceField(
            [{ value: "smooth", label: "说顺了" }, { value: "retry", label: "还不熟" }],
            `rating-${exercise.id}`
          );
          root.append(fallback);
          if (recordingBlob) root.append(audio);
          root.append(rating);
        } else {
          const result = document.createElement("p");
          result.textContent = recognizedPass ? "意思表达出来了。" : "关键词还不完整，算作已练习。";
          root.append(result);
        }
        primary.textContent = "继续";
        primary.addEventListener("click", async () => {
          primary.disabled = true;
          let passed = recognizedPass;
          if (rating) {
            const selected = rating.querySelector<HTMLInputElement>('input[type="radio"]:checked');
            if (!selected) {
              primary.disabled = false;
              return;
            }
            passed = selected.value === "smooth";
          }
          if (phrase) {
            state = recordPhraseAttempt(definition, state, phrase.id, {
              passed,
              answerRevealed: false,
              supportLevel: support,
              activity: "production"
            });
            lastAttemptClass = state.phraseClasses[phrase.id];
          }
          await persistCompletion(exercise.id);
          speechPhase = "idle";
          recording = undefined;
          recordingBlob = undefined;
          recognitionResult = undefined;
          recognizedPass = false;
          render();
        });
      }
    }
    root.append(primary);
    queueMicrotask(() => heading.focus());
  };

  render();
  return root;
}
