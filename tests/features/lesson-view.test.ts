import { afterEach, describe, expect, it, vi } from "vitest";
import { allMissions } from "../../src/content/catalog";
import { createLearnerProgressV1 } from "../../src/domain/progress";
import { renderLesson, type LessonPersistence } from "../../src/features/lesson/lesson-view";
import type { RecordingSession, SpeechPort } from "../../src/speech/speech-port";

const hotel = allMissions.find((mission) => mission.id === "hotel-checkin")!;

function fixture(recognition: { transcript: string; confidence: number | null } | null = null) {
  const recording: RecordingSession = { stop: vi.fn(async () => new Blob(["voice"], { type: "audio/webm" })) };
  const speech: SpeechPort = {
    playFixed: vi.fn(async () => undefined), speak: vi.fn(async () => undefined),
    startRecording: vi.fn(async () => recording), recognize: vi.fn(async () => recognition),
    recognitionMode: vi.fn(async () => recognition ? "automatic" : "self-rating")
  };
  const persistence: LessonPersistence = {
    saveExerciseResult: vi.fn(async () => undefined), saveLessonMetrics: vi.fn(async () => undefined)
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

  it("saves after a choice but never calls it mastered", async () => {
    const { speech, persistence } = fixture();
    const view = renderLesson({ mission: hotel, progress: createLearnerProgressV1(), speech, persistence });
    document.body.append(view);
    view.querySelector<HTMLInputElement>('input[type="radio"]')!.click();
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

    expect(persistence.saveLessonMetrics).toHaveBeenCalledWith(expect.objectContaining({ speakingSeconds: 3.4 }));
    expect(persistence.saveExerciseResult).toHaveBeenCalledTimes(1);
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
});
