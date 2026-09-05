import type { LearnerProgressV1 } from "../domain/progress";

export interface SaveExerciseResultInput {
  missionId: string;
  exerciseId: string;
}

export interface ProgressRepository {
  load(): Promise<LearnerProgressV1>;
  saveExerciseResult(input: SaveExerciseResultInput): Promise<LearnerProgressV1>;
  saveRecording(key: string, recording: Blob): Promise<void>;
  loadRecording(key: string): Promise<Blob | undefined>;
  reset(): Promise<void>;
  close(): void;
}
