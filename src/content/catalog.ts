import { z } from "zod";
import { missionSchema, type Mission } from "../domain/content-schema";
import { scoreTranscript } from "../domain/functional-score";
import { deepFreeze, renderRoleplayPrompt, type DeepReadonly } from "./content-validation";
import { businessMissions } from "./missions.business";
import { travelMissions } from "./missions.travel";

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
  assertUnique(
    missions.flatMap((mission) => mission.listeningScenarios?.map((scenario) => scenario.id) ?? []),
    "listening scenario"
  );

  for (const mission of missions) {
    for (const scenario of mission.listeningScenarios ?? []) {
      if (!scenario.id.startsWith(`${mission.id}-`)) {
        throw new Error(`listening scenario ${scenario.id} must be namespaced by ${mission.id}`);
      }
    }
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

const expectedTravelIds = ["hk-checkin", "helsinki-transfer", "rome-arrival", "hotel-checkin", "directions-tickets", "restaurant", "italy-high-speed-rail", "venice-vaporetto", "milan-swiss-transfer", "swiss-mountain-transit", "shopping-tax-refund", "urgent-help", "supermarket-groceries"];
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
  if (activeTargets.length !== 33) throw new Error("course requires exactly 33 active targets");
  return deepFreeze({ allMissions: missions, courseSessions: sessions });
}

const assembledCourse = assembleCourse(missionSource);
export const allMissions = assembledCourse.allMissions;
export const courseSessions = assembledCourse.courseSessions;

/** Consumer-facing thirteen-session course. */
export const catalog = courseSessions;

export { renderRoleplayPrompt };
