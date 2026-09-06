import { z } from "zod";

const isoDateTime = z.string().datetime({ offset: true });

const attemptSchema = z.object({
  attemptId: z.string().min(1).optional(),
  supportLevel: z.enum(["full", "english", "partial", "prompt-only"]),
  passed: z.boolean(),
  answerRevealed: z.boolean(),
  hintCount: z.number().int().nonnegative().optional(),
  timestamp: z.string().optional(),
  activity: z.enum(["production", "choice"]).optional()
}).strict();

const sessionSchema = z.object({
  missionId: z.string(),
  completedExerciseIds: z.array(z.string()),
  phraseAttempts: z.record(z.string(), z.array(attemptSchema)).optional(),
  phraseClasses: z.record(
    z.string(),
    z.enum(["introduced", "practiced", "recalled", "mastered"])
  ).optional(),
  exerciseEvents: z.record(z.string(), z.string()).optional()
}).strict().refine(
  (session) => new Set(session.completedExerciseIds).size === session.completedExerciseIds.length,
  { message: "completedExerciseIds must be unique", path: ["completedExerciseIds"] }
);

const calibrationSchema = z.object({
  supportLevel: z.enum(["full", "english", "partial", "prompt-only"]),
  correctItems: z.number().int().min(0).max(6),
  speakingSeconds: z.number().nonnegative(),
  completedAt: isoDateTime,
  recordingKeys: z.array(z.string().min(1)).max(2)
}).strict();

const phraseReviewSchema = z.object({
  dueAt: isoDateTime,
  successfulAttempts: z.number().int().nonnegative(),
  hintCount: z.number().int().nonnegative(),
  masteredAt: isoDateTime.optional(),
  lastAttemptOccurredAt: isoDateTime.optional(),
  lastScheduleEventId: z.string().min(1).optional(),
  projectionBaseSuccessfulAttempts: z.number().int().nonnegative().optional(),
  projectionBaseHintCount: z.number().int().nonnegative().optional(),
  projectionLegacyDueAt: isoDateTime.optional()
}).strict();

const lookupHistoryEntrySchema = z.object({
  text: z.string().trim().min(1).max(500),
  knownWords: z.array(z.string().regex(/^[a-z]+(?:'[a-z]+)?$/)).max(100),
  savedAt: isoDateTime
}).strict();

const dailyPlanSchema = z.object({
  missionIds: z.tuple([z.string().min(1), z.string().min(1), z.string().min(1)])
    .refine((ids) => new Set(ids).size === ids.length, "daily plan missions must be unique")
}).strict();

export const learnerProgressV1Schema = z.object({
  schemaVersion: z.literal(1),
  startedAt: isoDateTime,
  activeMissionId: z.string().nullable(),
  sessions: z.record(z.string(), sessionSchema),
  phraseReviews: z.record(z.string(), phraseReviewSchema),
  savedPhraseIds: z.array(z.string()),
  knownWords: z.array(z.string().regex(/^[a-z]+(?:'[a-z]+)?$/)).optional(),
  lookupHistory: z.array(lookupHistoryEntrySchema).max(50).optional(),
  dailyPlans: z.record(z.string().regex(/^\d{4}-\d{2}-\d{2}$/), dailyPlanSchema).optional(),
  speakingSeconds: z.number().nonnegative(),
  hintCount: z.number().int().nonnegative(),
  promptFreeScenarioIds: z.array(z.string()),
  reviewProjectionVersion: z.literal(1).optional(),
  reviewProjectionHintBase: z.number().int().nonnegative().optional(),
  calibration: calibrationSchema.optional()
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
