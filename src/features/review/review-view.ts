import { dailyReviewItem, type DailyReviewSlot } from "../../domain/daily-review";
import { localDateKey } from "../../domain/daily-plan";
import type { Attempt, LessonState } from "../../domain/lesson-engine";
import type { LearnerProgressV1 } from "../../domain/progress";
import type { SpeechPort } from "../../speech/speech-port";
import type { ProgressRepository, SaveExerciseResultInput } from "../../storage/progress-repository";

const slotLabels: Record<DailyReviewSlot, string> = { morning: "早晨", midday: "午间", evening: "晚上" };

export interface ReviewViewOptions {
  slot: DailyReviewSlot;
  progress: LearnerProgressV1;
  repository: Pick<ProgressRepository, "saveExerciseResult">;
  speech: Pick<SpeechPort, "speak">;
  now?: () => Date;
  onComplete?: () => void;
}

export function renderReview(options: ReviewViewOptions): HTMLElement {
  const reviewNow = (options.now ?? (() => new Date()))();
  const date = localDateKey(reviewNow);
  const exerciseId = `${date}-${options.slot}`;
  const eventId = `daily-review-${exerciseId}`;
  const attemptId = `${eventId}-attempt`;
  const item = dailyReviewItem(options.progress, options.slot, reviewNow);
  const session = options.progress.sessions["daily-review"];
  let revealed = false;
  let pending: SaveExerciseResultInput | undefined;
  let reviewAnswer: boolean | undefined;
  let saveError = "";
  const root = document.createElement("section");
  root.className = "review-view stack";

  const finish = () => {
    if (options.onComplete) options.onComplete();
    else root.dispatchEvent(new CustomEvent("app:navigate", {
      bubbles: true, detail: { href: "#/home" }
    }));
  };
  const play = (text: string, rate: 0.75 | 1) => {
    void options.speech.speak(text, rate).catch(() => {
      const error = document.createElement("p");
      error.setAttribute("role", "alert");
      error.textContent = "播放失败，请使用显示文字。";
      root.append(error);
    });
  };
  const payloadFor = (passed: boolean): SaveExerciseResultInput => {
    if (pending) return pending;
    const phraseId = item.phrase.id;
    const timestamp = reviewNow.toISOString();
    const attempt: Attempt = {
      attemptId,
      supportLevel: item.kind === "recall" ? "prompt-only" : "full",
      passed,
      answerRevealed: item.kind !== "reading",
      hintCount: item.kind === "recall" ? 0 : 1,
      timestamp,
      activity: item.kind === "recall" ? "production" : "choice"
    };
    const completedExerciseIds = [...(session?.completedExerciseIds ?? [])];
    if (!completedExerciseIds.includes(exerciseId)) completedExerciseIds.push(exerciseId);
    const lessonState: LessonState = {
      completedExerciseIds,
      phraseAttempts: {
        ...(session?.phraseAttempts ?? {}),
        [phraseId]: [...(session?.phraseAttempts?.[phraseId] ?? []), attempt]
      },
      phraseClasses: { ...(session?.phraseClasses ?? {}) }
    };
    pending = {
      missionId: "daily-review", exerciseId, eventId, lessonState,
      speakingSecondsDelta: 0,
      attemptEvent: {
        attemptId, phraseId, missionId: "daily-review",
        ...(item.kind === "listening" ? { scenarioId: item.scenario.id } : {}),
        hintUsed: (attempt.hintCount ?? 0) > 0,
        occurredAt: timestamp
      }
    };
    return pending;
  };
  const save = async (passed: boolean) => {
    try {
      await options.repository.saveExerciseResult(payloadFor(passed));
      finish();
    } catch {
      saveError = "保存失败，请重试。";
      render();
    }
  };

  const render = () => {
    root.replaceChildren();
    const heading = document.createElement("h1");
    heading.textContent = `${slotLabels[options.slot]} 2 分钟复习`;
    if (session?.completedExerciseIds.includes(exerciseId)) {
      const done = document.createElement("p");
      done.textContent = "这次碎片复习已完成。";
      const back = document.createElement("button");
      back.type = "button"; back.className = "primary-action"; back.textContent = "返回首页";
      back.addEventListener("click", finish);
      root.append(heading, done, back);
      return;
    }
    root.append(heading);
    const primary = document.createElement("button");
    primary.type = "button"; primary.className = "primary-action";
    if (item.kind === "recall") {
      const prompt = document.createElement("p");
      prompt.textContent = `试着说：${item.phrase.chinese}`;
      root.append(prompt);
      if (!revealed) {
        primary.textContent = "说完了，显示答案";
        primary.addEventListener("click", () => { revealed = true; render(); });
      } else {
        const answer = document.createElement("p"); answer.lang = "en"; answer.textContent = item.phrase.english;
        const select = document.createElement("select");
        for (const [value, label] of [["yes", "基本说出来了"], ["no", "还需要练习"]]) {
          const option = document.createElement("option"); option.value = value!; option.textContent = label!; select.append(option);
        }
        select.value = reviewAnswer === undefined ? "" : reviewAnswer ? "yes" : "no";
        const promptOption = document.createElement("option"); promptOption.value = ""; promptOption.textContent = "请选择"; promptOption.disabled = true;
        select.prepend(promptOption);
        select.addEventListener("change", () => { reviewAnswer = select.value === "yes"; primary.disabled = false; });
        primary.textContent = pending ? "重试保存" : "保存复习";
        primary.disabled = reviewAnswer === undefined;
        primary.addEventListener("click", () => { if (reviewAnswer !== undefined) void save(reviewAnswer); });
        root.append(answer, select);
      }
    } else if (item.kind === "listening") {
      const controls = document.createElement("div");
      for (const [label, rate] of [["正常播放", 1], ["慢速播放", 0.75]] as const) {
        const button = document.createElement("button"); button.type = "button"; button.textContent = label;
        button.addEventListener("click", () => play(item.scenario.transcript, rate)); controls.append(button);
      }
      const reveal = document.createElement("button"); reveal.type = "button"; reveal.textContent = "显示文字";
      reveal.addEventListener("click", () => { revealed = true; render(); }); controls.append(reveal);
      const select = document.createElement("select");
      [item.scenario.meaningZh, ...item.scenario.distractorsZh].forEach((label, index) => {
        const option = document.createElement("option"); option.value = index === 0 ? "yes" : "no"; option.textContent = label; select.append(option);
      });
      const promptOption = document.createElement("option"); promptOption.value = ""; promptOption.textContent = "请选择听到的意思"; promptOption.disabled = true;
      select.prepend(promptOption);
      select.value = reviewAnswer === undefined ? "" : reviewAnswer ? "yes" : "no";
      select.addEventListener("change", () => { reviewAnswer = select.value === "yes"; primary.disabled = false; });
      root.append(controls);
      if (revealed) { const text = document.createElement("p"); text.lang = "en"; text.textContent = item.scenario.transcript; root.append(text); }
      root.append(select); primary.textContent = pending ? "重试保存" : "保存复习";
      primary.disabled = reviewAnswer === undefined;
      primary.addEventListener("click", () => { if (reviewAnswer !== undefined) void save(reviewAnswer); });
    } else {
      const passage = document.createElement("p"); passage.lang = "en"; passage.textContent = item.reading.readingText;
      root.append(passage); primary.textContent = pending ? "重试保存" : "我找到关键信息了";
      primary.addEventListener("click", () => { void save(true); });
    }
    if (saveError) { const error = document.createElement("p"); error.setAttribute("role", "alert"); error.textContent = saveError; root.append(error); }
    root.append(primary);
  };
  render();
  return root;
}
