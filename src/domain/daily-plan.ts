import type { DeepReadonly } from "../content/content-validation";
import type { Mission } from "./content-schema";
import type { LearnerProgressV1 } from "./progress";
import type { DailyStep } from "./progress";
import { introductionComplete } from "./mission-learning";

export function localDateKey(now: Date): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function missionIsComplete(progress: LearnerProgressV1, mission: DeepReadonly<Mission>): boolean {
  const completed = new Set(progress.sessions[mission.id]?.completedExerciseIds ?? []);
  return mission.exercises.every((exercise) => completed.has(exercise.id));
}

export function selectDailyMissions(
  progress: LearnerProgressV1,
  missions: readonly DeepReadonly<Mission>[],
  now = new Date()
): [string, string, string] {
  const unfinished = missions.filter((mission) => !missionIsComplete(progress, mission));
  const dueMissionIds = new Set(Object.entries(progress.phraseReviews)
    .filter(([, review]) => new Date(review.dueAt).getTime() <= now.getTime())
    .flatMap(([phraseId]) => missions.filter((mission) =>
      mission.productionPhrases.some((phrase) => phrase.id === phraseId)).map((mission) => mission.id)));
  const ordered = [
    ...unfinished.filter((mission) => mission.id === progress.activeMissionId),
    ...unfinished.filter((mission) => dueMissionIds.has(mission.id)),
    ...unfinished,
    ...missions
  ];
  const unique = [...new Map(ordered.map((mission) => [mission.id, mission])).values()];
  if (unique.length < 3) throw new Error("daily plan requires three missions");
  return [unique[0]!.id, unique[1]!.id, unique[2]!.id];
}

export function selectDailySteps(
  progress: LearnerProgressV1,
  missions: readonly DeepReadonly<Mission>[],
  now = new Date()
): [DailyStep, DailyStep, DailyStep] {
  const learnable = missions.filter((mission) => (mission.learningSentences?.length ?? 0) > 0);
  const unfinished = learnable.filter((mission) => !missionIsComplete(progress, mission));
  const introduced = unfinished.filter((mission) => introductionComplete(progress, mission));
  const unintroduced = unfinished.filter((mission) => !introductionComplete(progress, mission));
  const dueMissionIds = new Set(Object.entries(progress.phraseReviews)
    .filter(([, review]) => new Date(review.dueAt).getTime() <= now.getTime())
    .flatMap(([phraseId]) => introduced.filter((mission) =>
      mission.productionPhrases.some((phrase) => phrase.id === phraseId)).map((mission) => mission.id)));
  const orderedChallenges = [
    ...introduced.filter((mission) => mission.id === progress.activeMissionId),
    ...introduced.filter((mission) => dueMissionIds.has(mission.id)),
    ...introduced
  ];
  const challenges = [...new Map(orderedChallenges.map((mission) => [mission.id, mission])).values()];
  const newMission = unintroduced.find((mission) => mission.id === progress.activeMissionId) ?? unintroduced[0];
  const steps: DailyStep[] = [];
  if (newMission) steps.push({ kind: "mission", missionId: newMission.id, mode: "introduction" });
  for (const mission of challenges) {
    if (steps.length >= 3) break;
    steps.push({ kind: "mission", missionId: mission.id, mode: "challenge" });
  }
  const reviewSlots = ["morning", "midday", "evening"] as const;
  for (const slot of reviewSlots) {
    if (steps.length >= 3) break;
    steps.push({ kind: "review", slot });
  }
  if (steps.length !== 3) throw new Error("daily plan requires three steps");
  return steps as [DailyStep, DailyStep, DailyStep];
}
