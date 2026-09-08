import { describe, expect, it } from "vitest";
import { createLearnerProgressV1, migrateProgress } from "../../src/domain/progress";

describe("mission introduction progress", () => {
  it("keeps legacy progress valid and accepts resumable introduction evidence", () => {
    expect(migrateProgress(createLearnerProgressV1()).missionIntroductions).toBeUndefined();
    const progress = createLearnerProgressV1();
    const parsed = migrateProgress({
      ...progress,
      missionIntroductions: {
        "hotel-checkin": {
          missionId: "hotel-checkin", nextSentenceIndex: 1,
          viewedSentenceIds: ["hotel-checkin-learn-reservation"],
          shadowedSentenceIds: ["hotel-checkin-learn-reservation"],
          completedRecapIndexes: []
        }
      }
    });
    expect(parsed.missionIntroductions?.["hotel-checkin"]?.nextSentenceIndex).toBe(1);
  });

  it("rejects invalid cursors, duplicates and recap positions", () => {
    const progress = createLearnerProgressV1();
    const base = {
      missionId: "hotel-checkin", nextSentenceIndex: 1,
      viewedSentenceIds: ["one"], shadowedSentenceIds: [], completedRecapIndexes: []
    };
    expect(() => migrateProgress({ ...progress, missionIntroductions: { hotel: { ...base, nextSentenceIndex: -1 } } })).toThrow();
    expect(() => migrateProgress({ ...progress, missionIntroductions: { hotel: { ...base, viewedSentenceIds: ["one", "one"] } } })).toThrow();
    expect(() => migrateProgress({ ...progress, missionIntroductions: { hotel: { ...base, completedRecapIndexes: [6] } } })).toThrow();
  });
});
