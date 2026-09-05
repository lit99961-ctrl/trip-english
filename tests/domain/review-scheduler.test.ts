import { describe, expect, it } from "vitest";
import { scheduleReview } from "../../src/domain/review-scheduler";

const now = new Date("2026-09-05T10:00:00.000Z");

describe("scheduleReview", () => {
  it.each([
    ["failed", 10, "same-session retry"],
    ["supported", 24 * 60, "supported success"],
    ["prompt-free", 3 * 24 * 60, "prompt-free recall"],
    ["mastered", 7 * 24 * 60, "mastered recall"]
  ] as const)("uses the base interval for %s", (outcome, intervalMinutes, reason) => {
    expect(scheduleReview({ outcome, confidence: 3, hintCount: 0, now })).toEqual({
      dueAt: new Date(now.getTime() + intervalMinutes * 60_000).toISOString(),
      intervalMinutes,
      reason
    });
  });

  it("shortens mastered and prompt-free reviews for low confidence", () => {
    expect(scheduleReview({ outcome: "mastered", confidence: 1, hintCount: 0, now }).intervalMinutes)
      .toBe(3 * 24 * 60);
    expect(scheduleReview({ outcome: "prompt-free", confidence: 1, hintCount: 0, now }).intervalMinutes)
      .toBe(24 * 60);
  });

  it("shortens a supported review to a same-session retry after two hints", () => {
    expect(scheduleReview({ outcome: "supported", confidence: 3, hintCount: 2, now })).toMatchObject({
      dueAt: "2026-09-05T10:10:00.000Z",
      intervalMinutes: 10,
      reason: "supported success with low confidence"
    });
  });

  it("does not shorten a review after exactly one hint", () => {
    expect(scheduleReview({ outcome: "supported", confidence: 3, hintCount: 1, now }).intervalMinutes)
      .toBe(24 * 60);
  });

  it("keeps failed recalls in the same session even when confidence is low", () => {
    expect(scheduleReview({ outcome: "failed", confidence: 1, hintCount: 2, now }).intervalMinutes)
      .toBe(10);
  });

  it("rejects invalid runtime confidence and hint counts", () => {
    expect(() => scheduleReview({ outcome: "supported", confidence: 4 as 1, hintCount: 0, now })).toThrow();
    expect(() => scheduleReview({ outcome: "supported", confidence: 3, hintCount: -1, now })).toThrow();
  });
});
