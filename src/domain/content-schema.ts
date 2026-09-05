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
  activeTarget: z.boolean().default(false),
  requiredKeywordGroups: z.array(z.array(z.string().min(1)).min(1)).min(1)
}).strict();

const exerciseSchema = z.discriminatedUnion("type", [
  z.object({ id: z.string(), type: z.literal("intent"), phraseId: z.string().optional(), promptZh: z.string().min(1) }).strict(),
  z.object({ id: z.string(), type: z.literal("shadow"), phraseId: z.string().optional(), promptZh: z.string().min(1) }).strict(),
  z.object({ id: z.string(), type: z.literal("recall"), phraseId: z.string().optional(), promptZh: z.string().min(1) }).strict(),
  z.object({ id: z.string(), type: z.literal("roleplay"), phraseId: z.string().min(1), promptZh: z.string().min(1), variation: z.record(z.string(), z.string()).refine((value) => Object.keys(value).length > 0), promptTemplate: z.string().min(1) }).strict().superRefine((exercise, context) => {
    const placeholders = [...exercise.promptTemplate.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]!);
    const keys = Object.keys(exercise.variation);
    if (placeholders.length === 0 || placeholders.some((key) => !keys.includes(key)) || keys.some((key) => !placeholders.includes(key))) {
      context.addIssue({ code: "custom", message: "roleplay variation keys must match promptTemplate placeholders" });
    }
  }),
  z.object({ id: z.string(), type: z.literal("reading"), phraseId: z.string().optional(), promptZh: z.string().min(1), readingText: z.string().min(1), questions: z.array(z.object({ promptZh: z.string().min(1), expectedAnswers: z.array(z.string().min(1)).min(1) }).strict()).min(1) }).strict()
]);

const missionFields = {
  id: z.string().min(1),
  titleZh: z.string().min(1),
  city: z.string().min(1),
  productionPhrases: z.array(phraseSchema).min(5).max(8),
  recognitionWords: z.array(z.string()).min(1)
};

export const missionSchema = z
  .discriminatedUnion("kind", [
    z.object({ ...missionFields, kind: z.literal("travel"), embeddedSession: z.never().optional(), exercises: z.array(exerciseSchema).min(5) }).strict(),
    z.object({
      ...missionFields,
      kind: z.literal("business"),
      embeddedSession: z.union([z.literal(4), z.literal(8), z.literal(11)]),
      exercises: z.array(exerciseSchema).min(1)
    }).strict()
  ])
  .refine(
    (mission) => mission.productionPhrases.some((phrase) => phrase.recovery),
    "mission requires a recovery phrase"
  );

export type Phrase = z.infer<typeof phraseSchema>;
export type Mission = z.infer<typeof missionSchema>;
