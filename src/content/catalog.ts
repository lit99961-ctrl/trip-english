import { z } from "zod";
import { missionSchema, type Mission } from "../domain/content-schema";

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

export function validateCatalog(candidate: unknown = seedCatalog): readonly Mission[] {
  const missions = z.array(missionSchema).parse(candidate);

  assertUnique(missions.map((mission) => mission.id), "mission");
  assertUnique(
    missions.flatMap((mission) => mission.productionPhrases.map((phrase) => phrase.id)),
    "production phrase"
  );

  for (const mission of missions) {
    assertUnique(mission.exercises.map((exercise) => exercise.id), "exercise");
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

const seedCatalog = [
  {
    id: "airport-arrival",
    kind: "travel",
    titleZh: "抵达机场",
    city: "Tokyo",
    productionPhrases: [
      { id: "airport-help", english: "Could you help me?", chinese: "你能帮我吗？", intent: "ask-help", keywords: ["help"], recovery: true },
      { id: "airport-arrival", english: "I just arrived.", chinese: "我刚到。", intent: "state-arrival", keywords: ["arrived"], recovery: false },
      { id: "airport-baggage", english: "Where is baggage claim?", chinese: "行李提取处在哪里？", intent: "find-baggage", keywords: ["baggage"], recovery: false },
      { id: "airport-taxi", english: "Where can I get a taxi?", chinese: "我在哪里可以坐出租车？", intent: "find-taxi", keywords: ["taxi"], recovery: false },
      { id: "airport-thanks", english: "Thank you very much.", chinese: "非常感谢。", intent: "thank", keywords: ["thank"], recovery: false }
    ],
    recognitionWords: ["arrival", "baggage", "taxi"],
    exercises: [
      { id: "airport-intent", type: "intent", phraseId: "airport-help", promptZh: "选择求助意图" },
      { id: "airport-shadow", type: "shadow", phraseId: "airport-arrival", promptZh: "跟读抵达表达" },
      { id: "airport-recall", type: "recall", phraseId: "airport-baggage", promptZh: "回忆行李提取处" },
      { id: "airport-roleplay", type: "roleplay", phraseId: "airport-taxi", promptZh: "询问出租车" },
      { id: "airport-reading", type: "reading", phraseId: "airport-thanks", promptZh: "朗读致谢" }
    ]
  }
] satisfies readonly Mission[];

export const catalog: readonly Mission[] = validateCatalog(seedCatalog);
