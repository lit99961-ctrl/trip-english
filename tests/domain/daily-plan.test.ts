import { describe, expect, it } from "vitest";
import { travelMissions } from "../../src/content/missions.travel";
import { localDateKey, selectDailyMissions } from "../../src/domain/daily-plan";
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
});
