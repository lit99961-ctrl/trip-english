import { z } from "zod";
import { missionSchema, type Mission } from "../domain/content-schema";
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

  for (const mission of missions) {
    const phraseIds = new Set(mission.productionPhrases.map((phrase) => phrase.id));

    for (const exercise of mission.exercises) {
      if (exercise.phraseId !== undefined && !phraseIds.has(exercise.phraseId)) {
        throw new Error(
          `exercise ${exercise.id} references missing phraseId: ${exercise.phraseId}`
        );
      }
    }
  }

  return deepFreeze(missions);
}

const missionSource = [...travelMissions, ...businessMissions];

export const allMissions: DeepReadonly<readonly Mission[]> = deepFreeze(validateCatalog(missionSource));

export interface CourseSession {
  readonly sessionNumber: number;
  readonly travelMission: Mission;
  readonly businessMission?: Mission;
}

const businessBySession = new Map([[4, businessMissions[0]!], [8, businessMissions[1]!], [11, businessMissions[2]!]]);

export function validateCourseSessions(candidate: unknown): readonly CourseSession[] {
  const sessions = candidate as CourseSession[];
  if (!Array.isArray(sessions) || sessions.length !== 12) throw new Error("course requires exactly 12 sessions");
  const numbers = sessions.map((session) => session.sessionNumber);
  if (numbers.some((number, index) => number !== index + 1)) throw new Error("course session numbers must be 1 through 12");
  for (const session of sessions) {
    if (session.travelMission.kind !== "travel") throw new Error("every session requires one travel mission");
    const expectedBusiness = businessBySession.get(session.sessionNumber);
    if (session.businessMission !== expectedBusiness) throw new Error("business missions must be embedded in sessions 4, 8, and 11");
  }
  const activeTargets = sessions.flatMap((session) => [session.travelMission, session.businessMission].filter(Boolean).flatMap((mission) => mission!.productionPhrases)).filter((phrase) => phrase.activeTarget);
  if (activeTargets.length !== 30) throw new Error("course requires exactly 30 active targets");
  return sessions;
}

const courseSessionSource = travelMissions.map((travelMission, index) => ({
  sessionNumber: index + 1,
  travelMission,
  businessMission: businessBySession.get(index + 1)
}));

export const courseSessions: DeepReadonly<readonly CourseSession[]> = deepFreeze(validateCourseSessions(courseSessionSource));

/** Consumer-facing twelve-session course. */
export const catalog = courseSessions;
export { renderRoleplayPrompt };
