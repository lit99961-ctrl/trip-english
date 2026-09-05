import { z } from "zod";
import { missionSchema, type Mission } from "../domain/content-schema";
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

export function validateCatalog(candidate: unknown = catalogSource): readonly Mission[] {
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

  return missions;
}

const catalogSource = [...travelMissions, ...businessMissions];

export const catalog: readonly Mission[] = validateCatalog(catalogSource);
