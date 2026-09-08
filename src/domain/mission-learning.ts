import type { DeepReadonly } from "../content/content-validation";
import type { LearningSentence, Mission } from "./content-schema";
import type { LearnerProgressV1, MissionIntroductionProgress } from "./progress";

export type LearningScreen =
  | { type: "sentence"; index: number }
  | { type: "recap"; index: 5 | 10 | 15 }
  | { type: "phrase-map" };

export function nextLearningScreen(
  sentences: DeepReadonly<readonly LearningSentence[]>,
  introduction: DeepReadonly<MissionIntroductionProgress> | undefined
): LearningScreen {
  const nextIndex = introduction?.nextSentenceIndex ?? 0;
  const completedRecaps = new Set(introduction?.completedRecapIndexes ?? []);
  if ((nextIndex === 5 || nextIndex === 10 || nextIndex === 15) && !completedRecaps.has(nextIndex)) {
    return { type: "recap", index: nextIndex };
  }
  if (nextIndex < sentences.length) return { type: "sentence", index: nextIndex };
  return { type: "phrase-map" };
}

export function learningProgressLabel(index: number, total: number): string {
  return `${Math.min(index + 1, total)} / ${total}`;
}

export function groupPhraseMap(sentences: DeepReadonly<readonly LearningSentence[]>) {
  return {
    production: sentences.filter((sentence) => sentence.role === "production"),
    reception: sentences.filter((sentence) => sentence.role === "reception")
  };
}

export function introductionComplete(
  progress: LearnerProgressV1,
  mission: DeepReadonly<Mission>
): boolean {
  if (!mission.learningSentences?.length) return true;
  if (progress.missionIntroductions?.[mission.id]?.completedAt) return true;
  return (progress.sessions[mission.id]?.completedExerciseIds.length ?? 0) > 0;
}
