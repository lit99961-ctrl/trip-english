import { describe, expect, it, vi } from "vitest";
import { createLearnerProgressV1 } from "../../src/domain/progress";
import { renderReview } from "../../src/features/review/review-view";

describe("two minute review", () => {
  it("keeps one primary action and saves a stable exactly-once recall event", async () => {
    const saveExerciseResult = vi.fn(async () => createLearnerProgressV1());
    const onComplete = vi.fn();
    const view = renderReview({
      slot: "morning", progress: createLearnerProgressV1(),
      repository: { saveExerciseResult }, speech: { speak: vi.fn() },
      now: () => new Date(2026, 8, 6), onComplete
    });
    expect(view.querySelectorAll("button.primary-action")).toHaveLength(1);
    view.querySelector<HTMLButtonElement>("button.primary-action")!.click();
    expect(view.textContent).toContain("I would like to check in.");
    const rating = view.querySelector<HTMLSelectElement>("select")!;
    rating.value = "yes";
    rating.dispatchEvent(new Event("change"));
    view.querySelector<HTMLButtonElement>("button.primary-action")!.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(saveExerciseResult).toHaveBeenCalledWith(expect.objectContaining({
      missionId: "daily-review", eventId: "daily-review-2026-09-06-morning",
      attemptEvent: expect.objectContaining({ attemptId: "daily-review-2026-09-06-morning-attempt" })
    }));
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it("supports normal, slow and silent listening", () => {
    const speak = vi.fn(async (_text: string, _rate: 0.75 | 1) => undefined);
    const view = renderReview({
      slot: "midday", progress: createLearnerProgressV1(),
      repository: { saveExerciseResult: vi.fn() }, speech: { speak },
      now: () => new Date(2026, 8, 6)
    });
    const buttons = [...view.querySelectorAll<HTMLButtonElement>("button")];
    buttons.find((button) => button.textContent === "正常播放")!.click();
    buttons.find((button) => button.textContent === "慢速播放")!.click();
    buttons.find((button) => button.textContent === "显示文字")!.click();
    expect(speak.mock.calls[0]![1]).toBe(1);
    expect(speak.mock.calls[1]![1]).toBe(0.75);
    expect(view.textContent).toContain("Your room is ready now.");
  });
});
