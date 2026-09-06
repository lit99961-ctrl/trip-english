import { travelMissions } from "../content/missions.travel";
import type { LearnerProgressV1 } from "./progress";

export type DailyReviewSlot = "morning" | "midday" | "evening";

export function isDailyReviewSlot(value: string): value is DailyReviewSlot {
  return value === "morning" || value === "midday" || value === "evening";
}

export function dailyReviewItem(progress: LearnerProgressV1, slot: DailyReviewSlot, now = new Date()) {
  const phrases = travelMissions.flatMap((mission) => mission.productionPhrases
    .filter((phrase) => phrase.activeTarget)
    .map((phrase) => ({ mission, phrase })));
  const due = phrases.filter(({ phrase }) => {
    const review = progress.phraseReviews[phrase.id];
    return review && new Date(review.dueAt).getTime() <= now.getTime();
  });
  const unmastered = phrases.filter(({ phrase }) =>
    progress.phraseReviews[phrase.id]?.masteredAt === undefined);
  const chosen = due[0] ?? unmastered[0] ?? phrases[0]!;
  if (slot === "morning") return { kind: "recall" as const, ...chosen };
  if (slot === "midday") {
    const mission = travelMissions.find((candidate) => candidate.listeningScenarios?.length) ?? chosen.mission;
    return { kind: "listening" as const, mission, phrase: chosen.phrase, scenario: mission.listeningScenarios![0]! };
  }
  const mission = travelMissions.find((candidate) => candidate.exercises.some((exercise) => exercise.type === "reading"))!;
  const reading = mission.exercises.find((exercise) => exercise.type === "reading")!;
  return { kind: "reading" as const, mission, phrase: chosen.phrase, reading };
}
