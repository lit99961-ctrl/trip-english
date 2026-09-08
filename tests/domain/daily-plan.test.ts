import { describe, expect, it } from "vitest";
import { travelMissions } from "../../src/content/missions.travel";
import { localDateKey, selectDailyMissions, selectDailySteps } from "../../src/domain/daily-plan";
import { createLearnerProgressV1 } from "../../src/domain/progress";

describe("daily training plan", () => {
  it("uses a local date and selects three unique missions with the active one first", () => {
    const progress = createLearnerProgressV1();
    progress.activeMissionId = "restaurant";
    const selected = selectDailyMissions(progress, travelMissions);
    expect(selected).toHaveLength(3);
    expect(new Set(selected).size).toBe(3);
    expect(selected[0]).toBe("restaurant");
    expect(localDateKey(new Date(2026, 8, 6, 23, 30))).toBe("2026-09-06");
  });

  it("adds at most one unlearned mission and fills the sprint with lightweight reviews", () => {
    const progress = createLearnerProgressV1();
    const focus = travelMissions.filter((mission) => mission.learningSentences?.length).slice(0, 3);
    const steps = selectDailySteps(progress, focus, new Date("2026-09-08T08:00:00.000Z"));
    expect(steps).toHaveLength(3);
    expect(steps.filter((step) => step.kind === "mission" && step.mode === "introduction")).toHaveLength(1);
    expect(steps.filter((step) => step.kind === "review")).toHaveLength(2);
  });

  it("prefers an introduced unfinished mission as a challenge", () => {
    const progress = createLearnerProgressV1();
    const focus = travelMissions.filter((mission) => mission.learningSentences?.length).slice(0, 3);
    const introduced = focus[0]!;
    progress.missionIntroductions = { [introduced.id]: {
      missionId: introduced.id,
      nextSentenceIndex: introduced.learningSentences!.length,
      viewedSentenceIds: introduced.learningSentences!.map((sentence) => sentence.id),
      shadowedSentenceIds: [], completedRecapIndexes: [5, 10, 15],
      completedAt: "2026-09-08T07:00:00.000Z"
    } };
    const steps = selectDailySteps(progress, focus, new Date("2026-09-08T08:00:00.000Z"));
    expect(steps).toContainEqual({ kind: "mission", missionId: introduced.id, mode: "challenge" });
    expect(steps.filter((step) => step.kind === "mission" && step.mode === "introduction")).toHaveLength(1);
  });
});
