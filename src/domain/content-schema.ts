import { z } from "zod";

export const phraseSchema = z.object({
  id: z.string().min(1),
  english: z.string().min(1),
  chinese: z.string().min(1),
  phonetic: z.string().optional(),
  intent: z.string().min(1),
  keywords: z.array(z.string().min(1)).min(1),
  audio: z.string().startsWith("/audio/").optional(),
  recovery: z.boolean().default(false),
  activeTarget: z.boolean().default(false)
});

const exerciseFields = {
  id: z.string(),
  phraseId: z.string().optional(),
  promptZh: z.string().min(1),
  variation: z.record(z.string(), z.string()).optional(),
  readingText: z.string().min(1).optional()
};

const exerciseSchema = z.discriminatedUnion("type", [
  z.object({ ...exerciseFields, type: z.literal("intent") }),
  z.object({ ...exerciseFields, type: z.literal("shadow") }),
  z.object({ ...exerciseFields, type: z.literal("recall") }),
  z.object({ ...exerciseFields, type: z.literal("roleplay"), variation: z.record(z.string(), z.string()) }),
  z.object({ ...exerciseFields, type: z.literal("reading"), readingText: z.string().min(1) })
]);

const missionFields = {
  id: z.string().min(1),
  titleZh: z.string().min(1),
  city: z.string().min(1),
  productionPhrases: z.array(phraseSchema).min(5).max(8),
  recognitionWords: z.array(z.string()).min(1),
  exercises: z.array(exerciseSchema).min(5)
};

export const missionSchema = z
  .discriminatedUnion("kind", [
    z.object({ ...missionFields, kind: z.literal("travel"), embeddedSession: z.never().optional() }),
    z.object({
      ...missionFields,
      kind: z.literal("business"),
      embeddedSession: z.union([z.literal(4), z.literal(8), z.literal(11)])
    })
  ])
  .refine(
    (mission) => mission.productionPhrases.some((phrase) => phrase.recovery),
    "mission requires a recovery phrase"
  );

export type Phrase = z.infer<typeof phraseSchema>;
export type Mission = z.infer<typeof missionSchema>;
