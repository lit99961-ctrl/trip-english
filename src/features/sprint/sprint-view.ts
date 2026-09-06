import { travelMissions } from "../../content/missions.travel";
import { localDateKey, missionIsComplete, selectDailyMissions } from "../../domain/daily-plan";
import type { ProgressRepository } from "../../storage/progress-repository";

type SprintRepository = Pick<ProgressRepository, "load" | "ensureDailyPlan">;

export interface SprintViewOptions {
  repository: SprintRepository;
  now?: () => Date;
  onStartMission: (missionId: string) => void;
  onComplete?: () => void;
}

export async function renderSprint(options: SprintViewOptions): Promise<HTMLElement> {
  const now = (options.now ?? (() => new Date()))();
  const date = localDateKey(now);
  let progress = await options.repository.load();
  const selected = progress.dailyPlans?.[date]?.missionIds ?? selectDailyMissions(progress, travelMissions, now);
  if (!progress.dailyPlans?.[date]) progress = await options.repository.ensureDailyPlan(date, selected);
  const missionIds = progress.dailyPlans?.[date]?.missionIds ?? selected;
  const missions = missionIds.map((id) => travelMissions.find((mission) => mission.id === id)!).filter(Boolean);
  const nextIndex = missions.findIndex((mission) => !missionIsComplete(progress, mission));

  const root = document.createElement("section");
  root.className = "sprint-view stack";
  const heading = document.createElement("h1");
  heading.textContent = "今天的 30 分钟训练";
  const summary = document.createElement("p");
  summary.textContent = nextIndex < 0 ? "今天的三个场景已完成。" : `第 ${nextIndex + 1} / 3 个场景`;
  const list = document.createElement("ol");
  list.className = "daily-plan-list";
  missions.forEach((mission, index) => {
    const item = document.createElement("li");
    item.textContent = `${missionIsComplete(progress, mission) ? "✓ " : ""}${mission.titleZh} · ${mission.city}`;
    if (index === nextIndex) item.setAttribute("aria-current", "step");
    list.append(item);
  });
  const primary = document.createElement("button");
  primary.type = "button";
  primary.className = "primary-action";
  primary.textContent = nextIndex < 0 ? "返回首页" : nextIndex === 0 ? "开始第 1 个场景" : "继续训练";
  primary.addEventListener("click", () => nextIndex < 0
    ? options.onComplete?.()
    : options.onStartMission(missions[nextIndex]!.id));
  root.append(heading, summary, list, primary);
  return root;
}
