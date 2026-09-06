import type { DeepReadonly } from "../content/content-validation";
import type { Mission } from "./content-schema";
import type { LearnerProgressV1 } from "./progress";

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
