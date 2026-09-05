import { z } from "zod";
import { missionSchema, type Mission } from "../domain/content-schema";
import { scoreTranscript } from "../domain/functional-score";
import { deepFreeze, renderRoleplayPrompt, type DeepReadonly } from "./content-validation";
import { businessMissions } from "./missions.business";
import { travelMissions } from "./missions.travel";
import { emergencyPhrases } from "./emergency-phrases";

export function assertUnique(ids: string[], label: string): void {
  const seen = new Set<string>();
  const duplicates: string[] = [];

  for (const id of ids) {
    if (seen.has(id) && !duplicates.includes(id)) {
      duplicates.push(id);
    }
    seen.add(id);
  }

  if (duplicates.length > 0) {
    throw new Error(`${label} duplicate ids: ${duplicates.join(", ")}`);
  }
}

export function validateCatalog(candidate: unknown = missionSource): DeepReadonly<readonly Mission[]> {
  const missions = z.array(missionSchema).parse(candidate);

  assertUnique(missions.map((mission) => mission.id), "mission");
  assertUnique(
    missions.flatMap((mission) => mission.productionPhrases.map((phrase) => phrase.id)),
    "production phrase"
  );
  assertUnique(
    missions.flatMap((mission) => mission.exercises.map((exercise) => exercise.id)),
    "exercise"
  );

  for (const mission of missions) {
    const phrasesById = new Map(mission.productionPhrases.map((phrase) => [phrase.id, phrase]));

    for (const exercise of mission.exercises) {
      if (exercise.phraseId !== undefined && !phrasesById.has(exercise.phraseId)) {
        throw new Error(
          `exercise ${exercise.id} references missing phraseId: ${exercise.phraseId}`
        );
      }
      if (exercise.type === "roleplay") {
        const phrase = phrasesById.get(exercise.phraseId)!;
        const renderedPrompt = renderRoleplayPrompt(exercise.promptTemplate, exercise.variation);
        if (!scoreTranscript(renderedPrompt, { requiredKeywords: phrase.requiredKeywordGroups }).passed) {
          throw new Error(`roleplay ${exercise.id} does not satisfy linked phrase ${phrase.id}`);
        }
      }
    }
  }

  return deepFreeze(missions);
}

const missionSource = [...travelMissions, ...businessMissions];

export interface CourseSession {
  readonly sessionNumber: number;
  readonly travelMission: Mission;
  readonly businessMission?: Mission;
}

export interface CourseAssembly {
  readonly allMissions: readonly Mission[];
  readonly courseSessions: readonly CourseSession[];
}

const expectedTravelIds = ["hk-checkin", "helsinki-transfer", "rome-arrival", "hotel-checkin", "directions-tickets", "restaurant", "italy-high-speed-rail", "venice-vaporetto", "milan-swiss-transfer", "swiss-mountain-transit", "shopping-tax-refund", "urgent-help"];
const expectedBusinessSessions = new Map([["email-action", 4], ["internet-headline", 8], ["message-intent", 11]]);

export function assembleCourse(candidate: unknown) {
  const missions = validateCatalog(candidate);
  const travel = missions.filter((mission) => mission.kind === "travel");
  const business = missions.filter((mission) => mission.kind === "business");
  if (travel.map((mission) => mission.id).join("|") !== expectedTravelIds.join("|")) throw new Error("travel mission order is invalid");
  if (business.length !== 3 || business.some((mission) => expectedBusinessSessions.get(mission.id) !== mission.embeddedSession)) throw new Error("business session mapping is invalid");
  const businessBySession = new Map<number, (typeof business)[number]>(business.map((mission) => [mission.embeddedSession, mission]));
  const sessions = travel.map((travelMission, index) => ({ sessionNumber: index + 1, travelMission, businessMission: businessBySession.get(index + 1) }));
  const activeTargets = sessions.flatMap((session) => [session.travelMission, session.businessMission].filter(Boolean).flatMap((mission) => mission!.productionPhrases)).filter((phrase) => phrase.activeTarget);
  if (activeTargets.length !== 30) throw new Error("course requires exactly 30 active targets");
  return deepFreeze({ allMissions: missions, courseSessions: sessions });
}

const assembledCourse = assembleCourse(missionSource);
export const allMissions = assembledCourse.allMissions;
export const courseSessions = assembledCourse.courseSessions;

/** Consumer-facing twelve-session course. */
export const catalog = courseSessions;

const safeAudioSlugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function contentIdToAudioSlug(id: string): string {
  if (!safeAudioSlugPattern.test(id)) throw new Error(`unsafe audio content id: ${id}`);
  return id;
}

function toFixedAudioPhrase(phrase: { readonly id: string; readonly english: string; readonly audio?: string | undefined }) {
  if (phrase.audio === undefined) throw new Error(`fixed audio path missing for ${phrase.id}`);
  return { id: phrase.id, english: phrase.english, audio: phrase.audio };
}

const productionAudioPhrases = allMissions.flatMap((mission) =>
  mission.productionPhrases.map(toFixedAudioPhrase)
);
const emergencyAudioPhrases = emergencyPhrases.map(toFixedAudioPhrase);
const fixedAudioSource = [...productionAudioPhrases, ...emergencyAudioPhrases];

assertUnique(fixedAudioSource.map((phrase) => phrase.id), "fixed audio");
assertUnique(fixedAudioSource.map((phrase) => phrase.audio), "fixed audio path");
if (fixedAudioSource.length !== 150) throw new Error(`fixed audio requires exactly 150 phrases, got ${fixedAudioSource.length}`);
for (const phrase of fixedAudioSource) {
  const slug = contentIdToAudioSlug(phrase.id);
  const directory = phrase.id.startsWith("em-") ? "emergency" : "phrases";
  const expected = `/audio/${directory}/${slug}.aiff`;
  if (phrase.audio !== expected) throw new Error(`fixed audio path mismatch for ${phrase.id}: ${phrase.audio}`);
}

export const fixedAudioPhrases = deepFreeze(fixedAudioSource);
export { renderRoleplayPrompt };
