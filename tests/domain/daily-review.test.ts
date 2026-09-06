import { describe, expect, it } from "vitest";
import { dailyReviewItem } from "../../src/domain/daily-review";
import { createLearnerProgressV1 } from "../../src/domain/progress";

describe("daily quick reviews", () => {
  it("offers recall, real listening and reading across the three slots", () => {
    const progress = createLearnerProgressV1();
    expect(dailyReviewItem(progress, "morning").kind).toBe("recall");
    expect(dailyReviewItem(progress, "midday").kind).toBe("listening");
    expect(dailyReviewItem(progress, "evening").kind).toBe("reading");
  });
});
