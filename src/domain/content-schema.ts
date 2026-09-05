import { z } from "zod";

export const phraseSchema = z.object({
  id: z.string().min(1),
  english: z.string().min(1),
  chinese: z.string().min(1),
  phonetic: z.string().optional(),
  intent: z.string().min(1),
  keywords: z.array(z.string().min(1)).min(1),
  audio: z.string().startsWith("/audio/").optional(),
  recovery: z.boolean().default(false)
});

const exerciseSchema = z.object({
  id: z.string(),
  type: z.enum(["intent", "shadow", "recall", "roleplay", "reading"]),
  phraseId: z.string().optional(),
  promptZh: z.string().min(1),
  variation: z.record(z.string(), z.string()).optional()
});

export const missionSchema = z
  .object({
    id: z.string().min(1),
    kind: z.enum(["travel", "business"]),
    titleZh: z.string().min(1),
    city: z.string().min(1),
    productionPhrases: z.array(phraseSchema).min(5).max(8),
    recognitionWords: z.array(z.string()).min(1),
    exercises: z.array(exerciseSchema).min(5)
  })
  .refine(
    (mission) => mission.productionPhrases.some((phrase) => phrase.recovery),
    "mission requires a recovery phrase"
  );

export type Phrase = z.infer<typeof phraseSchema>;
export type Mission = z.infer<typeof missionSchema>;
