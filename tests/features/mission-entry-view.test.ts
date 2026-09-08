import { describe, expect, it, vi } from "vitest";
import { travelMissions } from "../../src/content/missions.travel";
import { createLearnerProgressV1 } from "../../src/domain/progress";
import { missionDestination, renderMissionEntry } from "../../src/features/mission-entry/mission-entry-view";

const hotel = travelMissions.find((mission) => mission.id === "hotel-checkin")!;

describe("mission entry", () => {
  it("requires learning first, keeps legacy learners compatible, and honors explicit challenge", () => {
    const progress = createLearnerProgressV1();
    expect(missionDestination(progress, hotel, false)).toBe("learning");
    expect(missionDestination(progress, hotel, true)).toBe("learning");
    progress.sessions[hotel.id] = {
      missionId: hotel.id,
      completedExerciseIds: [hotel.exercises[0]!.id]
    };
    expect(missionDestination(progress, hotel, false)).toBe("entry");
    expect(missionDestination(progress, hotel, true)).toBe("lesson");
  });

  it("recommends quick review while still offering a direct challenge", () => {
    const onReview = vi.fn();
    const onChallenge = vi.fn();
    const view = renderMissionEntry({ mission: hotel, onReview, onChallenge });
    expect(view.querySelectorAll("button.primary-action")).toHaveLength(1);
    expect(view.querySelector("button.primary-action")?.textContent).toContain("快速复习");
    expect(view.textContent).toContain("直接挑战");
    view.querySelector<HTMLButtonElement>("button.primary-action")!.click();
    [...view.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.includes("直接挑战"))!.click();
    expect(onReview).toHaveBeenCalledOnce();
    expect(onChallenge).toHaveBeenCalledOnce();
  });
});
