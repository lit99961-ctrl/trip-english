import type { Mission } from "../domain/content-schema";
import { allMissions } from "./catalog";
import { renderRoleplayPrompt, type DeepReadonly } from "./content-validation";
import { emergencyPhrases, type EmergencyPhrase } from "./emergency-phrases";

/**
 * The authoritative boundary for English text displayed by course experiences.
 * Scoring-only keywords and Chinese prompts are intentionally excluded.
 */
export function collectDisplayedEnglish(
  missions: DeepReadonly<readonly Mission[]>,
  emergencies: DeepReadonly<readonly EmergencyPhrase[]>
): readonly string[] {
  const texts: string[] = [];
  for (const mission of missions) {
    texts.push(mission.city, ...mission.recognitionWords);
    texts.push(...mission.productionPhrases.map((phrase) => phrase.english));
    for (const exercise of mission.exercises) {
      if (exercise.type === "reading") {
        texts.push(exercise.readingText);
        texts.push(...exercise.questions.flatMap((question) => question.expectedAnswers));
      }
      if (exercise.type === "roleplay") {
        texts.push(renderRoleplayPrompt(exercise.promptTemplate, exercise.variation));
        texts.push(...Object.values(exercise.variation));
      }
    }
  }
  texts.push(...emergencies.map((phrase) => phrase.english));
  return Object.freeze(texts);
}

export const displayedEnglish = collectDisplayedEnglish(allMissions, emergencyPhrases);
