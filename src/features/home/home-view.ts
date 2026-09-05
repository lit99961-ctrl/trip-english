import { courseSessions } from "../../content/catalog";
import type { DeepReadonly } from "../../content/content-validation";
import type { Mission } from "../../domain/content-schema";
import type { LearnerProgressV1 } from "../../domain/progress";
import type { ProgressRepository } from "../../storage/progress-repository";

type HomeRepository = Pick<ProgressRepository, "load">;

export interface HomeViewOptions {
  repository: HomeRepository;
  now?: () => Date;
  onStartMission?: (missionId: string) => void;
}

const masteryLabels = {
  introduced: "已见过",
  practiced: "练习中",
  recalled: "已回忆",
  mastered: "已掌握"
} as const;

function missionComplete(progress: LearnerProgressV1, mission: DeepReadonly<Mission>): boolean {
  const completed = new Set(progress.sessions[mission.id]?.completedExerciseIds ?? []);
  return mission.exercises.every((exercise) => completed.has(exercise.id));
}

function sessionIndexFor(progress: LearnerProgressV1): number {
  const active = courseSessions.findIndex(({ travelMission, businessMission }) =>
    travelMission.id === progress.activeMissionId || businessMission?.id === progress.activeMissionId
  );
  if (active >= 0) {
    const session = courseSessions[active]!;
    const activeMission = session.travelMission.id === progress.activeMissionId
      ? session.travelMission
      : session.businessMission;
    if (activeMission && !missionComplete(progress, activeMission)) return active;
  }
  const firstUnfinished = courseSessions.findIndex(({ travelMission, businessMission }) =>
    !missionComplete(progress, travelMission)
    || (businessMission !== undefined && !missionComplete(progress, businessMission))
  );
  return firstUnfinished >= 0 ? firstUnfinished : courseSessions.length - 1;
}

function missionForSession(progress: LearnerProgressV1, sessionIndex: number): DeepReadonly<Mission> {
  const session = courseSessions[sessionIndex]!;
  const activeMission = session.travelMission.id === progress.activeMissionId
    ? session.travelMission
    : session.businessMission?.id === progress.activeMissionId
      ? session.businessMission
      : undefined;
  if (activeMission && !missionComplete(progress, activeMission)) return activeMission;
  if (!missionComplete(progress, session.travelMission)) return session.travelMission;
  if (session.businessMission && !missionComplete(progress, session.businessMission)) return session.businessMission;
  return session.travelMission;
}

function strongestMastery(
  progress: LearnerProgressV1,
  missionIds: readonly string[]
): keyof typeof masteryLabels | undefined {
  const ranks = ["introduced", "practiced", "recalled", "mastered"] as const;
  const classes = missionIds.flatMap((id) =>
    Object.values(progress.sessions[id]?.phraseClasses ?? {})
  );
  for (let index = ranks.length - 1; index >= 0; index -= 1) {
    const rank = ranks[index]!;
    if (classes.includes(rank)) return rank;
  }
  return undefined;
}

export async function renderHome(options: HomeViewOptions): Promise<HTMLElement> {
  const root = document.createElement("section");
  root.className = "home-view stack";
  root.setAttribute("aria-live", "polite");

  let progress: LearnerProgressV1;
  try {
    progress = await options.repository.load();
  } catch {
    const heading = document.createElement("h1");
    heading.textContent = "旅行英语冲刺";
    const error = document.createElement("p");
    error.setAttribute("role", "alert");
    error.textContent = "暂时无法读取上次进度，请刷新后重试。";
    root.append(heading, error);
    return root;
  }

  const now = (options.now ?? (() => new Date()))();
  const sessionIndex = sessionIndexFor(progress);
  const current = courseSessions[sessionIndex]!;
  const mission = missionForSession(progress, sessionIndex);
  const dueCount = Object.values(progress.phraseReviews)
    .filter((review) => new Date(review.dueAt).getTime() <= now.getTime()).length;

  const eyebrow = document.createElement("p");
  eyebrow.className = "eyebrow";
  eyebrow.textContent = `Day ${current.sessionNumber} · ${current.travelMission.city}`;
  const heading = document.createElement("h1");
  heading.textContent = mission.titleZh;
  const route = document.createElement("ol");
  route.className = "route-map";
  route.setAttribute("aria-label", "12 天训练路线");
  courseSessions.forEach((session, index) => {
    const node = document.createElement("li");
    node.dataset.routeNode = "";
    if (index === sessionIndex) node.setAttribute("aria-current", "step");
    const city = document.createElement("span");
    city.textContent = session.travelMission.city;
    const mastery = strongestMastery(progress, [
      session.travelMission.id,
      ...(session.businessMission ? [session.businessMission.id] : [])
    ]);
    if (mastery) {
      const stamp = document.createElement("small");
      stamp.className = "city-stamp";
      stamp.dataset.mastery = mastery;
      stamp.textContent = masteryLabels[mastery];
      node.append(city, stamp);
    } else {
      node.append(city);
    }
    route.append(node);
  });

  const review = document.createElement("p");
  review.className = "metric-chip";
  review.textContent = `待复习 ${dueCount}`;
  const start = document.createElement("button");
  start.type = "button";
  start.className = "primary-action";
  start.textContent = "开始今日任务";
  start.addEventListener("click", () => {
    if (options.onStartMission) options.onStartMission(mission.id);
    else root.dispatchEvent(new CustomEvent("app:start-mission", {
      bubbles: true,
      detail: { missionId: mission.id }
    }));
  });
  root.append(eyebrow, heading, route, review, start);
  return root;
}
