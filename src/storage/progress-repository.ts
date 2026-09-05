import type { LearnerProgressV1 } from "../domain/progress";
import type { LessonState, SupportLevel } from "../domain/lesson-engine";

export interface SaveExerciseResultInput {
  missionId: string;
  exerciseId: string;
  lessonState?: LessonState;
  speakingSeconds?: number;
  eventId?: string;
  speakingSecondsDelta?: number;
}

export interface SaveCalibrationResultInput {
  supportLevel: SupportLevel;
  correctItems: number;
  speakingSeconds: number;
  completedAt: string;
  recordingKeys: string[];
}

export type RestoreToken = string;

export type RestoreRollbackOutcome =
  | { status: "rolled-back" }
  | { status: "preserved-newer-state" }
  | { status: "checkpoint-mismatch" };

export type RestoreFinalizeOutcome =
  | { status: "finalized" }
  | { status: "checkpoint-mismatch" };

export interface ProgressRepository {
  load(): Promise<LearnerProgressV1>;
  saveExerciseResult(input: SaveExerciseResultInput): Promise<LearnerProgressV1>;
  saveCalibrationResult(input: SaveCalibrationResultInput): Promise<LearnerProgressV1>;
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
