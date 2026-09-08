import { describe, expect, it, vi } from "vitest";
import { createLearnerProgressV1 } from "../../src/domain/progress";
import type { DailyStep } from "../../src/domain/progress";
import { renderSprint } from "../../src/features/sprint/sprint-view";

describe("30 minute sprint", () => {
  it("persists one stable three-mission plan and opens its current step", async () => {
    const progress = createLearnerProgressV1();
    const ensureDailyPlan = vi.fn(async (
      date: string,
      missionIds: readonly [string, string, string],
      steps?: readonly [DailyStep, DailyStep, DailyStep]
    ) => {
      progress.dailyPlans = { [date]: {
        missionIds: [...missionIds],
        ...(steps ? { steps: [...steps] as [DailyStep, DailyStep, DailyStep] } : {})
      } };
      return progress;
    });
    const onStartMission = vi.fn();
    const view = await renderSprint({
      repository: { load: async () => progress, ensureDailyPlan },
      now: () => new Date(2026, 8, 6),
      onStartMission
    });
    expect(view.textContent).toContain("第 1 / 3 步");
    expect(view.querySelectorAll("ol li")).toHaveLength(3);
    expect(view.querySelectorAll("button.primary-action")).toHaveLength(1);
    view.querySelector<HTMLButtonElement>("button.primary-action")!.click();
    expect(onStartMission).toHaveBeenCalledWith("hotel-checkin", "introduction");
    expect(ensureDailyPlan).toHaveBeenCalledOnce();
  });
});
