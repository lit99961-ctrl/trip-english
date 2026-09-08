import { courseSessions } from "../../content/catalog";
import { travelMissions } from "../../content/missions.travel";
import type { DeepReadonly } from "../../content/content-validation";
import type { Mission } from "../../domain/content-schema";
import { localDateKey, selectDailyMissions } from "../../domain/daily-plan";
import type { DailyReviewSlot } from "../../domain/daily-review";
import type { LearnerProgressV1 } from "../../domain/progress";
import type { ProgressRepository } from "../../storage/progress-repository";

type HomeRepository = Pick<ProgressRepository, "load"> & Partial<Pick<ProgressRepository, "ensureDailyPlan">>;

export interface HomeViewOptions {
  repository: HomeRepository;
  now?: () => Date;
  onStartMission?: (missionId: string) => void;
  onStartSprint?: () => void;
  onStartReview?: (slot: DailyReviewSlot) => void;
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

function aggregateMastery(
  progress: LearnerProgressV1,
  missions: readonly DeepReadonly<Mission>[]
): { level: keyof typeof masteryLabels; label: string } | undefined {
  const ranks = ["introduced", "practiced", "recalled", "mastered"] as const;
  const authoredPhraseIds = missions.flatMap((mission) =>
    mission.productionPhrases.map((phrase) => phrase.id)
  );
  const classesByPhrase = Object.assign({}, ...missions.map((mission) =>
    progress.sessions[mission.id]?.phraseClasses ?? {}
  )) as Record<string, keyof typeof masteryLabels>;
  const classes = authoredPhraseIds.flatMap((phraseId) =>
    classesByPhrase[phraseId] ? [classesByPhrase[phraseId]] : []
  );
  if (classes.length === 0) return undefined;
  if (classes.length < authoredPhraseIds.length) {
    return { level: "practiced", label: `${masteryLabels.practiced} ${classes.length}/${authoredPhraseIds.length}` };
  }
  const lowestRank = ranks.find((rank) => classes.includes(rank)) ?? "mastered";
  return { level: lowestRank, label: masteryLabels[lowestRank] };
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
  const date = localDateKey(now);
  const suggestedMissionIds = progress.dailyPlans?.[date]?.missionIds ?? selectDailyMissions(progress, travelMissions, now);
  if (!progress.dailyPlans?.[date] && options.repository.ensureDailyPlan) {
    progress = await options.repository.ensureDailyPlan(date, suggestedMissionIds);
  }
  const dailyMissionIds = progress.dailyPlans?.[date]?.missionIds ?? suggestedMissionIds;

  const eyebrow = document.createElement("p");
  eyebrow.className = "eyebrow";
  eyebrow.textContent = `Day ${current.sessionNumber} · ${current.travelMission.city}`;
  const heading = document.createElement("h1");
  heading.textContent = mission.titleZh;
  const route = document.createElement("ol");
  route.className = "route-map";
  route.setAttribute("aria-label", `${courseSessions.length} 天训练路线`);
  courseSessions.forEach((session, index) => {
    const node = document.createElement("li");
    node.dataset.routeNode = "";
    if (index === sessionIndex) node.setAttribute("aria-current", "step");
    const city = document.createElement("span");
    city.textContent = session.travelMission.city;
    const mastery = aggregateMastery(progress, [
      session.travelMission,
      ...(session.businessMission ? [session.businessMission] : [])
    ]);
    if (mastery) {
      const stamp = document.createElement("small");
      stamp.className = "city-stamp";
      stamp.dataset.mastery = mastery.level;
      stamp.textContent = mastery.label;
      node.append(city, stamp);
    } else {
      node.append(city);
    }
    route.append(node);
  });

  const review = document.createElement("p");
  review.className = "metric-chip";
  review.textContent = `待复习 ${dueCount} · 收藏 ${progress.savedPhraseIds.length}`;
  const learnedCount = new Set(Object.values(progress.missionIntroductions ?? {})
    .flatMap((introduction) => introduction.viewedSentenceIds)).size;
  const shadowedCount = new Set(Object.values(progress.missionIntroductions ?? {})
    .flatMap((introduction) => introduction.shadowedSentenceIds)).size;
  const roleplayIds = new Set(travelMissions.flatMap((travelMission) =>
    travelMission.exercises.filter((exercise) => exercise.type === "roleplay").map((exercise) => exercise.id)
  ));
  const taskReadyCount = new Set(progress.promptFreeScenarioIds.filter((id) => roleplayIds.has(id))).size;
  const learningEvidence = document.createElement("p");
  learningEvidence.className = "metric-chip";
  learningEvidence.textContent = `已学 ${learnedCount} · 跟读 ${shadowedCount} · 办成 ${taskReadyCount}`;
  const start = document.createElement("button");
  start.type = "button";
  start.className = "primary-action";
  start.textContent = "开始 / 继续今天的 30 分钟训练";
  start.addEventListener("click", () => {
    if (options.onStartSprint) options.onStartSprint();
    else if (options.onStartMission) options.onStartMission(mission.id);
    else root.dispatchEvent(new CustomEvent("app:start-mission", {
      bubbles: true,
      detail: { missionId: mission.id }
    }));
  });
  const daily = document.createElement("section");
  daily.className = "daily-plan-card";
  const dailyHeading = document.createElement("h2");
  dailyHeading.textContent = "今天 3 个实用场景";
  const dailyList = document.createElement("ol");
  dailyMissionIds.forEach((id) => {
    const item = document.createElement("li");
    item.textContent = travelMissions.find((candidate) => candidate.id === id)?.titleZh ?? id;
    dailyList.append(item);
  });
  daily.append(dailyHeading, dailyList);
  const reviews = document.createElement("section");
  reviews.className = "daily-review-grid";
  const reviewHeading = document.createElement("h2");
  reviewHeading.textContent = "三次碎片复习 · 每次 2 分钟";
  reviews.append(reviewHeading);
  (["morning", "midday", "evening"] as const).forEach((slot, index) => {
    const exerciseId = `${date}-${slot}`;
    const completed = progress.sessions["daily-review"]?.completedExerciseIds.includes(exerciseId) ?? false;
    const card = document.createElement("article");
    const title = document.createElement("h3");
    title.textContent = `${["早晨", "午间", "晚上"][index]} · 2 分钟`;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "secondary-action";
    button.textContent = completed ? "已完成" : "开始复习";
    button.disabled = completed;
    button.addEventListener("click", () => options.onStartReview?.(slot));
    card.append(title, button);
    reviews.append(card);
  });
  root.append(eyebrow, heading, daily, start, reviews, route, learningEvidence, review);
  return root;
}
