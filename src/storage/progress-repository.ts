import type { LearnerProgressV1 } from "../domain/progress";
import type { LessonState, SupportLevel } from "../domain/lesson-engine";

export interface SaveExerciseResultInput {
  missionId: string;
  exerciseId: string;
  lessonState?: LessonState;
  speakingSeconds?: number;
  eventId?: string;
  speakingSecondsDelta?: number;
  attemptEvent?: LearningAttemptEvent;
}

export interface LearningAttemptEvent {
  attemptId: string;
  phraseId: string;
  missionId: string;
  scenarioId?: string;
  hintUsed: boolean;
  occurredAt: string;
}

export interface SaveCalibrationResultInput {
  supportLevel: SupportLevel;
  correctItems: number;
  speakingSeconds: number;
  completedAt: string;
  recordingKeys: string[];
}

export interface SaveLookupInput {
  text: string;
  knownWords: string[];
  savedAt: string;
}

export type RestoreToken = string;

export type RestoreRollbackOutcome =
  | { status: "rolled-back" }
  | { status: "preserved-newer-state" }
  | { status: "checkpoint-mismatch" };

export type RestoreFinalizeOutcome =
  | { status: "finalized"; progress?: LearnerProgressV1 }
  | { status: "checkpoint-mismatch" };

export interface ProgressRepository {
  load(): Promise<LearnerProgressV1>;
  saveExerciseResult(input: SaveExerciseResultInput): Promise<LearnerProgressV1>;
  saveCalibrationResult(input: SaveCalibrationResultInput): Promise<LearnerProgressV1>;
  savePhraseId(phraseId: string): Promise<LearnerProgressV1>;
  saveLookup(input: SaveLookupInput): Promise<LearnerProgressV1>;
  ensureDailyPlan(date: string, missionIds: readonly [string, string, string]): Promise<LearnerProgressV1>;
  saveRecording(key: string, recording: Blob): Promise<void>;
  loadRecording(key: string): Promise<Blob | undefined>;
  beginRestore(progress: LearnerProgressV1): Promise<RestoreToken>;
  rollbackRestore(
    token: RestoreToken,
    expectedProgress: LearnerProgressV1
  ): Promise<RestoreRollbackOutcome>;
  finalizeRestore(
    token: RestoreToken,
    expectedProgress: LearnerProgressV1
  ): Promise<RestoreFinalizeOutcome>;
  reset(): Promise<void>;
  close(): void;
}
