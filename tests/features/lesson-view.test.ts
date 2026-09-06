import { afterEach, describe, expect, it, vi } from "vitest";
import { allMissions } from "../../src/content/catalog";
import { createLearnerProgressV1 } from "../../src/domain/progress";
import {
  renderLesson,
  type LessonPersistence,
  type LessonView
} from "../../src/features/lesson/lesson-view";
import type { RecordingSession, SpeechPort } from "../../src/speech/speech-port";

const hotel = allMissions.find((mission) => mission.id === "hotel-checkin")!;

function fixture(recognition: { transcript: string; confidence: number | null } | null = null) {
  const recording: RecordingSession = { stop: vi.fn(async () => new Blob(["voice"], { type: "audio/webm" })) };
  const speech: SpeechPort = {
    speak: vi.fn(async () => undefined),
    startRecording: vi.fn(async () => recording), recognize: vi.fn(async () => recognition),
    recognitionMode: vi.fn(async () => recognition ? "automatic" : "self-rating")
  };
  const persistence: LessonPersistence = {
    saveExerciseResult: vi.fn(async () => undefined)
  };
  return { speech, persistence };
}

function primary(view: HTMLElement): HTMLButtonElement {
  const button = view.querySelector<HTMLButtonElement>("button.primary-action");
  if (!button) throw new Error("primary action missing");
  return button;
}

async function click(view: HTMLElement): Promise<void> {
  primary(view).click();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

afterEach(() => document.body.replaceChildren());

describe("speaking-first lesson", () => {
  it("renders the five daily stages from resumable LessonEngine state", () => {
    const { speech, persistence } = fixture();
    const progress = createLearnerProgressV1(new Date("2026-09-05T00:00:00Z"));
    progress.sessions[hotel.id] = { missionId: hotel.id, completedExerciseIds: hotel.exercises.slice(0, 2).map((item) => item.id) };
    const view = renderLesson({ mission: hotel, progress, speech, persistence });

    expect(view.dataset.stage).toBe("supported-speaking");
    expect(view.dataset.stageMap).toBe("active-review comprehension supported-speaking prompt-free-role-play reading-close");
    expect(view.querySelectorAll("button.primary-action")).toHaveLength(1);
  });

  it("uses calibration support to change hints without leaking prompt-free answers", () => {
    const { speech, persistence } = fixture();
    const fullProgress = createLearnerProgressV1();
    const partialProgress = createLearnerProgressV1();
    const completedExerciseIds = hotel.exercises.slice(0, 2).map((item) => item.id);
    fullProgress.calibration = {
      supportLevel: "full", correctItems: 1, speakingSeconds: 2,
      completedAt: "2026-09-05T00:00:00.000Z", recordingKeys: []
    };
    partialProgress.calibration = {
      supportLevel: "partial", correctItems: 4, speakingSeconds: 2,
      completedAt: "2026-09-05T00:00:00.000Z", recordingKeys: []
    };
    fullProgress.sessions[hotel.id] = { missionId: hotel.id, completedExerciseIds };
    partialProgress.sessions[hotel.id] = { missionId: hotel.id, completedExerciseIds };

    const fullView = renderLesson({ mission: hotel, progress: fullProgress, speech, persistence });
    const partialView = renderLesson({ mission: hotel, progress: partialProgress, speech, persistence });
    const phrase = hotel.productionPhrases.find(
      (item) => item.id === hotel.exercises[2]!.phraseId
    )!;
    expect(fullView.textContent).toContain(phrase.english);
    expect(fullView.textContent).toContain(phrase.chinese);
    expect(partialView.textContent).not.toContain(phrase.english);
    expect(partialView.textContent).toContain(phrase.keywords[0]);

    const roleplayIndex = hotel.exercises.findIndex((exercise) => exercise.type === "roleplay");
    fullProgress.sessions[hotel.id]!.completedExerciseIds = hotel.exercises
      .slice(0, roleplayIndex).map((item) => item.id);
    const promptFree = renderLesson({ mission: hotel, progress: fullProgress, speech, persistence });
    const roleplayPhrase = hotel.productionPhrases.find(
      (item) => item.id === hotel.exercises[roleplayIndex]!.phraseId
    )!;
    expect(promptFree.textContent).not.toContain(roleplayPhrase.english);
  });

  it("derives the same calibrated hints after resume", () => {
    const { speech, persistence } = fixture();
    const progress = createLearnerProgressV1();
    progress.calibration = {
      supportLevel: "partial", correctItems: 4, speakingSeconds: 2,
      completedAt: "2026-09-05T00:00:00.000Z", recordingKeys: []
    };
    progress.sessions[hotel.id] = {
      missionId: hotel.id,
      completedExerciseIds: hotel.exercises.slice(0, 2).map((item) => item.id)
    };

    const first = renderLesson({ mission: hotel, progress, speech, persistence });
    const resumed = renderLesson({ mission: hotel, progress: structuredClone(progress), speech, persistence });
    expect(resumed.textContent).toBe(first.textContent);
    expect(resumed.dataset.stage).toBe(first.dataset.stage);
  });

  it("saves after active self-review but never calls it mastered", async () => {
    const { speech, persistence } = fixture();
    const view = renderLesson({ mission: hotel, progress: createLearnerProgressV1(), speech, persistence });
    document.body.append(view);
    await click(view);
    view.querySelector<HTMLInputElement>('input[value="recalled"]')!.click();
    await click(view);

    expect(persistence.saveExerciseResult).toHaveBeenCalledTimes(1);
    expect(view.textContent).not.toContain("已掌握");
    expect(view.dataset.lastAttemptClass).toBe("practiced");
  });

  it("offers listen-back self rating when recognition returns null", async () => {
    const { speech, persistence } = fixture(null);
    const progress = createLearnerProgressV1();
    progress.sessions[hotel.id] = { missionId: hotel.id, completedExerciseIds: hotel.exercises.slice(0, 2).map((item) => item.id) };
    const view = renderLesson({ mission: hotel, progress, speech, persistence });
    document.body.append(view);

    await click(view); // start recording
    await click(view); // stop and assess

    expect(view.textContent).toContain("回听");
    expect(view.textContent).toContain("说顺了");
    expect(view.textContent).toContain("还不熟");
    expect(view.querySelector("audio[controls]")).not.toBeNull();
    expect(view.querySelectorAll("button.primary-action")).toHaveLength(1);
  });

  it("adds only real recording duration and persists every completed speaking exercise", async () => {
    let time = 0;
    const { speech, persistence } = fixture({ transcript: "May I have two key cards", confidence: .8 });
    const progress = createLearnerProgressV1();
    progress.sessions[hotel.id] = { missionId: hotel.id, completedExerciseIds: hotel.exercises.slice(0, 2).map((item) => item.id) };
    const view = renderLesson({ mission: hotel, progress, speech, persistence, now: () => time });
    document.body.append(view);
    await click(view); // start at 0
    time = 3_400;
    await click(view); // stop
    await click(view); // continue

    expect(persistence.saveExerciseResult).toHaveBeenCalledWith(expect.objectContaining({
      speakingSeconds: 3.4,
      lessonState: expect.objectContaining({ phraseAttempts: expect.any(Object) })
    }));
  });

  it("fades prompts from supported text to a situation-only role-play", () => {
    const { speech, persistence } = fixture();
    const progress = createLearnerProgressV1();
    const roleplayIndex = hotel.exercises.findIndex((exercise) => exercise.type === "roleplay");
    progress.sessions[hotel.id] = { missionId: hotel.id, completedExerciseIds: hotel.exercises.slice(0, roleplayIndex).map((item) => item.id) };
    const view = renderLesson({ mission: hotel, progress, speech, persistence });

    expect(view.dataset.stage).toBe("prompt-free-role-play");
    expect(view.textContent).toContain("情境提示");
    expect(view.textContent).not.toContain(hotel.productionPhrases.find((phrase) => phrase.id === hotel.exercises[roleplayIndex]!.phraseId)!.english);
  });

  it("makes active review reveal-first and self-rated rather than answer selection", async () => {
    const { speech, persistence } = fixture();
    const view = renderLesson({ mission: hotel, progress: createLearnerProgressV1(), speech, persistence });
    document.body.append(view);

    expect(view.querySelector('input[type="radio"]')).toBeNull();
    expect(primary(view).textContent).toBe("显示答案");
    await click(view);
    expect(view.textContent).toContain("想起来了");
    expect(view.textContent).toContain("需要再练");
    expect(persistence.saveExerciseResult).not.toHaveBeenCalled();
    view.querySelector<HTMLInputElement>('input[value="recalled"]')!.click();
    await click(view);
    expect(persistence.saveExerciseResult).toHaveBeenCalledOnce();
  });

  it("checks authored reading questions before closing the lesson", async () => {
    const { speech, persistence } = fixture();
    const progress = createLearnerProgressV1();
    progress.sessions[hotel.id] = {
      missionId: hotel.id,
      completedExerciseIds: hotel.exercises.slice(0, -1).map((item) => item.id)
    };
    const view = renderLesson({ mission: hotel, progress, speech, persistence });
    document.body.append(view);

    expect(view.querySelectorAll("[data-reading-question]")).toHaveLength(1);
    view.querySelector<HTMLInputElement>("[data-reading-question] input")!.value = "a";
    await click(view);
    expect(view.textContent).toContain("再看一眼答案");
    expect(persistence.saveExerciseResult).not.toHaveBeenCalled();
    await click(view);
    expect(persistence.saveExerciseResult).toHaveBeenCalledOnce();
  });

  it.each(["resolve-null", "reject"])("falls back to self-rating when recognition %s", async (mode) => {
    const { speech, persistence } = fixture({ transcript: "unused", confidence: null });
    speech.recognize = mode === "reject"
      ? vi.fn(async () => { throw new Error("recognition failed"); })
      : vi.fn(async () => null);
    const progress = createLearnerProgressV1();
    progress.sessions[hotel.id] = { missionId: hotel.id, completedExerciseIds: hotel.exercises.slice(0, 2).map((item) => item.id) };
    const view = renderLesson({ mission: hotel, progress, speech, persistence });
    document.body.append(view);
    await click(view);
    await click(view);

    expect(view.textContent).toContain("说顺了");
    expect(view.querySelectorAll("button.primary-action")).toHaveLength(1);
  });

  it("does not count time when stopping a recording fails", async () => {
    const { speech, persistence } = fixture();
    speech.startRecording = vi.fn(async () => ({ stop: async () => { throw new Error("stop failed"); } }));
    const progress = createLearnerProgressV1();
    progress.sessions[hotel.id] = { missionId: hotel.id, completedExerciseIds: hotel.exercises.slice(0, 2).map((item) => item.id) };
    const view = renderLesson({ mission: hotel, progress, speech, persistence, now: () => 5_000 });
    document.body.append(view);
    await click(view);
    await click(view);
    view.querySelector<HTMLInputElement>('input[value="smooth"]')!.click();
    await click(view);

    expect(persistence.saveExerciseResult).toHaveBeenCalledWith(expect.objectContaining({ speakingSeconds: 0 }));
  });

  it("keeps the exercise recoverable and announces a persistence failure", async () => {
    const { speech, persistence } = fixture();
    persistence.saveExerciseResult = vi.fn(async () => { throw new Error("quota"); });
    const view = renderLesson({ mission: hotel, progress: createLearnerProgressV1(), speech, persistence });
    document.body.append(view);
    await click(view);
    view.querySelector<HTMLInputElement>('input[value="recalled"]')!.click();
    await click(view);

    expect(view.textContent).toContain("未能保存");
    expect(view.dataset.stage).toBe("active-review");
    expect(primary(view).disabled).toBe(false);
  });

  it("restores phrase attempt history and continues in exact authored order", () => {
    const { speech, persistence } = fixture();
    const progress = createLearnerProgressV1();
    progress.sessions[hotel.id] = {
      missionId: hotel.id,
      completedExerciseIds: hotel.exercises.slice(0, 3).map((item) => item.id),
      phraseAttempts: {
        [hotel.productionPhrases[0]!.id]: [{ supportLevel: "full", passed: true, answerRevealed: true }]
      },
      phraseClasses: { [hotel.productionPhrases[0]!.id]: "practiced" }
    };
    const view = renderLesson({ mission: hotel, progress, speech, persistence });

    expect(view.textContent).toContain(hotel.exercises[3]!.promptZh);
    expect(view.dataset.lastAttemptClass).toBe("practiced");
  });

  it("navigates on completion and disposes an active recording", async () => {
    const stop = vi.fn(async () => new Blob(["voice"]));
    const { speech, persistence } = fixture();
    speech.startRecording = vi.fn(async () => ({ stop }));
    const onComplete = vi.fn();
    const progress = createLearnerProgressV1();
    progress.sessions[hotel.id] = { missionId: hotel.id, completedExerciseIds: hotel.exercises.map((item) => item.id) };
    const finished = renderLesson({ mission: hotel, progress, speech, persistence, onComplete });
    document.body.append(finished);
    await click(finished);
    expect(onComplete).toHaveBeenCalledOnce();

    progress.sessions[hotel.id] = { missionId: hotel.id, completedExerciseIds: hotel.exercises.slice(0, 2).map((item) => item.id) };
    const active: LessonView = renderLesson({ mission: hotel, progress, speech, persistence });
    document.body.replaceChildren(active);
    await click(active);
    await active.dispose();
    expect(stop).toHaveBeenCalledOnce();
    expect(active.childElementCount).toBe(0);
  });

  it("keeps one primary action through every authored exercise state", async () => {
    const { speech, persistence } = fixture(null);
    const view = renderLesson({
      mission: hotel,
      progress: createLearnerProgressV1(),
      speech,
      persistence
    });
    document.body.append(view);
    const expectOnePrimary = () => {
      expect(view.querySelectorAll("button.primary-action")).toHaveLength(1);
    };

    expectOnePrimary();
    await click(view); // reveal active review
    expectOnePrimary();
    view.querySelector<HTMLInputElement>('input[value="recalled"]')!.click();
    await click(view); // finish active review
    expectOnePrimary();
    view.querySelector<HTMLInputElement>('input[value="answer"]')!.click();
    await click(view); // finish comprehension

    for (let speakingExercise = 0; speakingExercise < 3; speakingExercise += 1) {
      expectOnePrimary();
      await click(view); // start
      expectOnePrimary();
      await click(view); // stop
      expectOnePrimary();
      view.querySelector<HTMLInputElement>('input[value="smooth"]')!.click();
      await click(view); // finish speaking exercise
    }

    expectOnePrimary();
    const readingInput = view.querySelector<HTMLInputElement>("[data-reading-question] input")!;
    readingInput.value = JSON.parse(readingInput.dataset.expectedAnswers!)[0];
    await click(view); // check reading
    expectOnePrimary();
    await click(view); // close lesson
    expectOnePrimary();
    expect(view.textContent).toContain("完成");
  });

  it("revokes its listen-back URL on dispose", async () => {
    const revokeObjectURL = vi.fn();
    const { speech, persistence } = fixture(null);
    const progress = createLearnerProgressV1();
    progress.sessions[hotel.id] = {
      missionId: hotel.id,
      completedExerciseIds: hotel.exercises.slice(0, 2).map((item) => item.id)
    };
    const view = renderLesson({
      mission: hotel,
      progress,
      speech,
      persistence,
      createObjectURL: () => "blob:lesson",
      revokeObjectURL
    });
    document.body.append(view);
    await click(view);
    await click(view);
    expect(view.querySelector("audio")?.getAttribute("src")).toBe("blob:lesson");
    await view.dispose();

    expect(revokeObjectURL).toHaveBeenCalledWith("blob:lesson");
  });

  it("reuses the exact pending event and attempt when a save is retried", async () => {
    const { speech, persistence } = fixture();
    const saveExerciseResult = vi.fn()
      .mockRejectedValueOnce(new Error("quota"))
      .mockResolvedValueOnce(undefined);
    persistence.saveExerciseResult = saveExerciseResult;
    const createEventId = vi.fn(() => "event-stable");
    const createAttemptId = vi.fn(() => "attempt-stable");
    const view = renderLesson({
      mission: hotel,
      progress: createLearnerProgressV1(),
      speech,
      persistence,
      now: () => Date.parse("2026-09-05T10:00:00.000Z"),
      createEventId,
      createAttemptId
    });
    document.body.append(view);
    await click(view);
    view.querySelector<HTMLInputElement>('input[value="recalled"]')!.click();
    await click(view);
    expect(primary(view).textContent).toBe("重试保存");
    view.querySelector<HTMLInputElement>('input[value="recalled"]')!.click();
    await click(view);

    expect(createEventId).toHaveBeenCalledOnce();
    expect(createAttemptId).toHaveBeenCalledOnce();
    expect(saveExerciseResult).toHaveBeenCalledTimes(2);
    expect(saveExerciseResult).toHaveBeenNthCalledWith(
      2,
      saveExerciseResult.mock.calls[0]![0]
    );
    expect(saveExerciseResult).toHaveBeenLastCalledWith(expect.objectContaining({
      eventId: "event-stable",
      speakingSecondsDelta: 0,
      attemptEvent: {
        attemptId: "attempt-stable",
        phraseId: hotel.productionPhrases[0]!.id,
        missionId: hotel.id,
        hintUsed: true,
        occurredAt: "2026-09-05T10:00:00.000Z"
      },
      lessonState: expect.objectContaining({
        phraseAttempts: expect.objectContaining({
          [hotel.productionPhrases[0]!.id]: [expect.objectContaining({ attemptId: "attempt-stable" })]
        })
      })
    }));
  });

  it("reports runtime speech rejection without an unhandled promise", async () => {
    const { speech, persistence } = fixture();
    speech.speak = vi.fn(async () => { throw new Error("unavailable"); });
    const progress = createLearnerProgressV1();
    progress.sessions[hotel.id] = {
      missionId: hotel.id,
      completedExerciseIds: [hotel.exercises[0]!.id]
    };
    const view = renderLesson({ mission: hotel, progress, speech, persistence });
    document.body.append(view);

    view.querySelector<HTMLButtonElement>("button.secondary-action")!.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(view.querySelector('[role="alert"]')?.textContent).toContain("播放失败");
    expect(view.querySelectorAll("button.primary-action")).toHaveLength(1);
  });
});
