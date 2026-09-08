import { afterEach, describe, expect, it, vi } from "vitest";
import { createLearnerProgressV1 } from "../../src/domain/progress";
import { allMissions } from "../../src/content/catalog";
import { encodeBackup } from "../../src/storage/backup-codec";
import { renderProgress } from "../../src/features/progress/progress-view";
import type { ProgressRepository } from "../../src/storage/progress-repository";
import type { SpeechPort } from "../../src/speech/speech-port";

function repository(progress = createLearnerProgressV1()): ProgressRepository {
  return {
    load: vi.fn(async () => progress),
    saveExerciseResult: vi.fn(), saveCalibrationResult: vi.fn(),
    savePhraseId: vi.fn(async () => progress), saveLookup: vi.fn(async () => progress),
    ensureDailyPlan: vi.fn(async () => progress),
    advanceMissionIntroduction: vi.fn(async () => progress),
    saveRecording: vi.fn(async () => undefined), loadRecording: vi.fn(async () => undefined),
    beginRestore: vi.fn(async () => "restore-token"),
    rollbackRestore: vi.fn(async () => ({ status: "rolled-back" as const })),
    finalizeRestore: vi.fn(async (_token, expected) => ({ status: "finalized" as const, progress: expected })),
    reset: vi.fn(), close: vi.fn()
  };
}

function speech(): SpeechPort {
  return {
    speak: vi.fn(), recognize: vi.fn(),
    recognitionMode: vi.fn(async () => "self-rating" as const),
    startRecording: vi.fn(async () => ({ stop: async () => new Blob(["final"]) }))
  };
}

afterEach(() => document.body.replaceChildren());

describe("measured progress", () => {
  it("reports sprint measures from persisted evidence", async () => {
    const progress = createLearnerProgressV1();
    progress.speakingSeconds = 3_660;
    progress.promptFreeScenarioIds = ["hotel-roleplay", "train-roleplay"];
    progress.hintCount = 4;
    progress.savedPhraseIds = ["em-help-112"];
    progress.knownWords = ["train", "ticket"];
    const targets = allMissions.flatMap((mission) => mission.productionPhrases).filter((phrase) => phrase.activeTarget);
    progress.sessions[allMissions[0]!.id] = {
      missionId: allMissions[0]!.id,
      completedExerciseIds: [],
      phraseClasses: {
        [targets[0]!.id]: "mastered",
        [targets[1]!.id]: "recalled",
        [targets[2]!.id]: "practiced"
      }
    };
    const view = await renderProgress({
      repository: repository(progress), speech: speech(),
      requestPersistence: async () => "granted"
    });

    expect(view.textContent).toContain("61 / 120 分钟");
    expect(view.textContent).toContain("2 / 33");
    expect(view.textContent).toContain("无提示场景 2");
    expect(view.textContent).toContain("已授权持久存储");
    expect(view.textContent).toContain("提示趋势");
    expect(view.textContent).toContain("句卡 1 · 单词 2");
  });

  it("compares per-attempt hint use rather than unequal raw totals", async () => {
    const progress = createLearnerProgressV1();
    progress.sessions.hotel = {
      missionId: "hotel", completedExerciseIds: [],
      phraseAttempts: {
        phrase: [
          { supportLevel: "full", passed: true, answerRevealed: false, hintCount: 2, timestamp: "2026-09-01T00:00:00Z" },
          { supportLevel: "full", passed: true, answerRevealed: false, hintCount: 2, timestamp: "2026-09-02T00:00:00Z" },
          { supportLevel: "prompt-only", passed: true, answerRevealed: false, hintCount: 0, timestamp: "2026-09-03T00:00:00Z" },
          { supportLevel: "prompt-only", passed: true, answerRevealed: false, hintCount: 0, timestamp: "2026-09-04T00:00:00Z" }
        ]
      }
    };
    const view = await renderProgress({ repository: repository(progress), speech: speech() });
    expect(view.textContent).toContain("每次提示从 2 降到 0");
  });

  it("shows an in-page validated preview before explicit restore confirmation", async () => {
    const current = createLearnerProgressV1(new Date("2026-09-05T00:00:00Z"));
    const replacement = createLearnerProgressV1(new Date("2026-09-01T00:00:00Z"));
    replacement.activeMissionId = "venice-vaporetto";
    replacement.speakingSeconds = 150;
    replacement.sessions["venice-vaporetto"] = {
      missionId: "venice-vaporetto", completedExerciseIds: ["venice-vaporetto-intent"]
    };
    const repo = repository(current);
    const confirmRestore = vi.fn(async () => true);
    const view = await renderProgress({ repository: repo, speech: speech(), confirmRestore });
    document.body.append(view);
    const input = view.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, "files", { configurable: true, value: [new File([
      encodeBackup(replacement, { now: () => new Date("2026-09-05T10:00:00Z") })
    ], "backup.json", { type: "application/json" })] });
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(confirmRestore).not.toHaveBeenCalled();
    expect(repo.beginRestore).not.toHaveBeenCalled();
    expect(view.textContent).toContain("2026-09-05");
    expect(view.textContent).toContain("课程版本 1");
    expect(view.textContent).toContain("任务记录 1");
    expect(view.textContent).toContain("口语 2.5 分钟");
    view.querySelector<HTMLButtonElement>("[data-confirm-restore]")!.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(confirmRestore).toHaveBeenCalledWith(expect.objectContaining({ missionCount: 1 }));
    expect(repo.beginRestore).toHaveBeenCalledWith(expect.objectContaining({ activeMissionId: "venice-vaporetto" }));

    Object.defineProperty(input, "files", { configurable: true, value: [new File(["not json"], "bad.json")] });
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(view.textContent).toContain("无法恢复");
    expect(repo.beginRestore).toHaveBeenCalledTimes(1);
  });

  it("cancels a prepared restore without mutating progress", async () => {
    const repo = repository();
    const view = await renderProgress({ repository: repo, speech: speech() });
    document.body.append(view);
    const input = view.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, "files", { configurable: true, value: [new File([
      encodeBackup(createLearnerProgressV1(), { now: () => new Date("2026-09-05T10:00:00Z") })
    ], "backup.json")] });
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    view.querySelector<HTMLButtonElement>("[data-cancel-restore]")!.click();
    expect(repo.beginRestore).not.toHaveBeenCalled();
    expect(view.textContent).toContain("已取消恢复");
    expect(input.disabled).toBe(false);
  });
});
