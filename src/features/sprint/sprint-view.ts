import { travelMissions } from "../../content/missions.travel";
import { localDateKey, missionIsComplete, selectDailyMissions, selectDailySteps } from "../../domain/daily-plan";
import { introductionComplete } from "../../domain/mission-learning";
import type { DailyStep } from "../../domain/progress";
import type { DailyReviewSlot } from "../../domain/daily-review";
import type { ProgressRepository } from "../../storage/progress-repository";

type SprintRepository = Pick<ProgressRepository, "load" | "ensureDailyPlan">;

export interface SprintViewOptions {
  repository: SprintRepository;
  now?: () => Date;
  onStartMission: (missionId: string, mode: "introduction" | "challenge") => void;
  onStartReview?: (slot: DailyReviewSlot) => void;
  onComplete?: () => void;
}

export async function renderSprint(options: SprintViewOptions): Promise<HTMLElement> {
  const now = (options.now ?? (() => new Date()))();
  const date = localDateKey(now);
  let progress = await options.repository.load();
  const selected = progress.dailyPlans?.[date]?.missionIds ?? selectDailyMissions(progress, travelMissions, now);
  const suggestedSteps = selectDailySteps(progress, travelMissions, now);
  if (!progress.dailyPlans?.[date]?.steps) {
    progress = await options.repository.ensureDailyPlan(date, selected, suggestedSteps);
  }
  const steps = progress.dailyPlans?.[date]?.steps ?? suggestedSteps;
  const stepComplete = (step: DailyStep): boolean => {
    if (step.kind === "review") {
      return progress.sessions["daily-review"]?.completedExerciseIds.includes(`${date}-${step.slot}`) ?? false;
    }
    const mission = travelMissions.find((candidate) => candidate.id === step.missionId);
    if (!mission) return true;
    return step.mode === "introduction"
      ? introductionComplete(progress, mission)
      : missionIsComplete(progress, mission);
  };
  const nextIndex = steps.findIndex((step) => !stepComplete(step));

  const root = document.createElement("section");
  root.className = "sprint-view stack";
  const heading = document.createElement("h1");
  heading.textContent = "今天的 30 分钟训练";
  const summary = document.createElement("p");
  summary.textContent = nextIndex < 0 ? "今天的三个训练步骤已完成。" : `第 ${nextIndex + 1} / 3 步`;
  const list = document.createElement("ol");
  list.className = "daily-plan-list";
  steps.forEach((step, index) => {
    const item = document.createElement("li");
    const completed = stepComplete(step);
    if (step.kind === "review") {
      const labels = { morning: "早晨", midday: "午间", evening: "晚上" } as const;
      item.textContent = `${completed ? "✓ " : ""}${labels[step.slot]} · 2 分钟碎片复习`;
    } else {
      const mission = travelMissions.find((candidate) => candidate.id === step.missionId)!;
      item.textContent = `${completed ? "✓ " : ""}${mission.titleZh} · ${step.mode === "introduction" ? "先学习" : "挑战"}`;
    }
    if (index === nextIndex) item.setAttribute("aria-current", "step");
    list.append(item);
  });
  const primary = document.createElement("button");
  primary.type = "button";
  primary.className = "primary-action";
  primary.textContent = nextIndex < 0 ? "返回首页" : nextIndex === 0 ? "开始第 1 步" : "继续训练";
  primary.addEventListener("click", () => {
    if (nextIndex < 0) return options.onComplete?.();
    const step = steps[nextIndex]!;
    if (step.kind === "review") options.onStartReview?.(step.slot);
    else options.onStartMission(step.missionId, step.mode);
  });
  root.append(heading, summary, list, primary);
  return root;
}
