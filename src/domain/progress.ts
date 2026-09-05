import { z } from "zod";

const isoDateTime = z.string().datetime({ offset: true });

const sessionSchema = z.object({
  missionId: z.string(),
  completedExerciseIds: z.array(z.string())
}).strict();

const phraseReviewSchema = z.object({
  dueAt: isoDateTime,
  successfulAttempts: z.number().int().nonnegative(),
  hintCount: z.number().int().nonnegative(),
  masteredAt: isoDateTime.optional()
}).strict();

export const learnerProgressV1Schema = z.object({
  schemaVersion: z.literal(1),
  startedAt: isoDateTime,
  activeMissionId: z.string().nullable(),
  sessions: z.record(z.string(), sessionSchema),
  phraseReviews: z.record(z.string(), phraseReviewSchema),
  savedPhraseIds: z.array(z.string()),
  speakingSeconds: z.number().nonnegative(),
  hintCount: z.number().int().nonnegative(),
  promptFreeScenarioIds: z.array(z.string())
}).strict();

export type LearnerProgressV1 = z.infer<typeof learnerProgressV1Schema>;

export function createLearnerProgressV1(now = new Date()): LearnerProgressV1 {
  return {
    schemaVersion: 1,
    startedAt: now.toISOString(),
    activeMissionId: null,
    sessions: {},
    phraseReviews: {},
    savedPhraseIds: [],
    speakingSeconds: 0,
    hintCount: 0,
    promptFreeScenarioIds: []
  };
}

export function migrateProgress(input: unknown, now = new Date()): LearnerProgressV1 {
  if (input === undefined) {
    return createLearnerProgressV1(now);
  }

  return learnerProgressV1Schema.parse(input);
}
