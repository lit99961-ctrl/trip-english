import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import {
  canMaster,
  classifyAttempt,
  type Attempt,
  type AttemptClass
} from "../domain/lesson-engine";
import {
  createLearnerProgressV1,
  migrateProgress,
  type LearnerProgressV1
} from "../domain/progress";
import type {
  ProgressRepository,
  RestoreFinalizeOutcome,
  RestoreRollbackOutcome,
  RestoreToken,
  SaveCalibrationResultInput,
  SaveExerciseResultInput
} from "./progress-repository";

const DATABASE_VERSION = 1;
const PROGRESS_KEY = "learner-progress";
const RESTORE_CHECKPOINT_KEY = "pre-restore-progress";
const MAX_EXERCISE_SPEAKING_SECONDS = 3_600;

interface ProgressDatabase extends DBSchema {
  progress: {
    key: string;
    value: LearnerProgressV1;
  };
  recordings: {
    key: string;
    value: Blob;
  };
  "restore-checkpoints": {
    key: string;
    value: RestoreCheckpoint;
  };
}

interface RestoreCheckpoint {
  token: RestoreToken;
  previousProgress: LearnerProgressV1;
  expectedProgress: LearnerProgressV1;
}

export class IndexedDbProgressRepository implements ProgressRepository {
  private databasePromise: Promise<IDBPDatabase<ProgressDatabase>> | undefined;

  public constructor(
    private readonly databaseName = "trip-english",
    private readonly now: () => Date = () => new Date()
  ) {}

  public async load(): Promise<LearnerProgressV1> {
    const database = await this.getDatabase();
    const transaction = database.transaction("progress", "readwrite");
    const storedProgress = await transaction.store.get(PROGRESS_KEY);
    const progress = migrateProgress(storedProgress, this.now());

    if (storedProgress === undefined) {
      await transaction.store.put(progress, PROGRESS_KEY);
    }

    await transaction.done;
    return progress;
  }

  public async saveExerciseResult(
    input: SaveExerciseResultInput
  ): Promise<LearnerProgressV1> {
    if (
      input.speakingSeconds !== undefined
      && (!Number.isFinite(input.speakingSeconds) || input.speakingSeconds < 0)
    ) {
      throw new Error("speakingSeconds must be a non-negative finite number");
    }
    const isEventWrite = input.eventId !== undefined || input.speakingSecondsDelta !== undefined;
    if (isEventWrite && (!input.eventId || input.speakingSecondsDelta === undefined || !input.lessonState)) {
      throw new Error("eventId, speakingSecondsDelta, and lessonState are required together");
    }
    if (
      input.speakingSecondsDelta !== undefined
      && (
        !Number.isFinite(input.speakingSecondsDelta)
        || input.speakingSecondsDelta < 0
        || input.speakingSecondsDelta > MAX_EXERCISE_SPEAKING_SECONDS
      )
    ) {
      throw new Error("speakingSecondsDelta is outside the allowed range");
    }
    const database = await this.getDatabase();
    const transaction = database.transaction("progress", "readwrite");
    const storedProgress = await transaction.store.get(PROGRESS_KEY);
    const progress = migrateProgress(storedProgress, this.now());
    const session = progress.sessions[input.missionId] ?? {
      missionId: input.missionId,
      completedExerciseIds: []
    };
    const normalizedEventPayload = isEventWrite
      ? stableJson({
        exerciseId: input.exerciseId,
        completedExerciseIds: input.lessonState!.completedExerciseIds,
        phraseAttempts: input.lessonState!.phraseAttempts,
        speakingSecondsDelta: input.speakingSecondsDelta
      })
      : undefined;
    const storedEventPayload = input.eventId
      ? session.exerciseEvents?.[input.eventId]
      : undefined;
    if (storedEventPayload !== undefined) {
      if (storedEventPayload !== normalizedEventPayload) {
        throw new Error(`exercise event id collision: ${input.eventId}`);
      }
      await transaction.done;
      return progress;
    }
    const incomingCompletedIds = input.lessonState?.completedExerciseIds
      ?? (session.completedExerciseIds.includes(input.exerciseId)
        ? session.completedExerciseIds
        : [...session.completedExerciseIds, input.exerciseId]);
    const completedExerciseIds = input.lessonState
      ? mergeCompletionEvent(
        session.completedExerciseIds,
        incomingCompletedIds,
        input.exerciseId,
        isEventWrite
      )
      : [...incomingCompletedIds];
    if (!completedExerciseIds.includes(input.exerciseId)) {
      throw new Error("lessonState must include the completed exercise");
    }
    const phraseAttempts = input.lessonState === undefined
      ? session.phraseAttempts
      : mergeAttemptRecords(session.phraseAttempts, input.lessonState.phraseAttempts);
    const nextProgress: LearnerProgressV1 = {
      ...progress,
      activeMissionId: input.missionId,
      speakingSeconds: isEventWrite
        ? progress.speakingSeconds + input.speakingSecondsDelta!
        : input.speakingSeconds === undefined
          ? progress.speakingSeconds
          : Math.max(progress.speakingSeconds, input.speakingSeconds),
      sessions: {
        ...progress.sessions,
        [input.missionId]: {
          ...session,
          completedExerciseIds,
          ...(phraseAttempts === undefined ? {} : {
            phraseAttempts,
            phraseClasses: derivePhraseClasses(phraseAttempts)
          }),
          ...(input.eventId === undefined ? {} : {
            exerciseEvents: {
              ...(session.exerciseEvents ?? {}),
              [input.eventId]: normalizedEventPayload!
            }
          })
        }
      }
    };

    const validatedProgress = migrateProgress(nextProgress, this.now());
    await transaction.store.put(validatedProgress, PROGRESS_KEY);
    await transaction.done;
    return validatedProgress;
  }

  public async saveCalibrationResult(
    input: SaveCalibrationResultInput
  ): Promise<LearnerProgressV1> {
    const database = await this.getDatabase();
    const transaction = database.transaction("progress", "readwrite");
    const storedProgress = await transaction.store.get(PROGRESS_KEY);
    const progress = migrateProgress(storedProgress, this.now());
    const nextProgress = migrateProgress({ ...progress, calibration: input }, this.now());
    await transaction.store.put(nextProgress, PROGRESS_KEY);
    await transaction.done;
    return nextProgress;
  }

  public async saveRecording(key: string, recording: Blob): Promise<void> {
    const database = await this.getDatabase();
    await database.put("recordings", recording, key);
  }

  public async loadRecording(key: string): Promise<Blob | undefined> {
    const database = await this.getDatabase();
    return database.get("recordings", key);
  }

  public async beginRestore(progress: LearnerProgressV1): Promise<RestoreToken> {
    const expectedProgress = migrateProgress(progress, this.now());
    const token = crypto.randomUUID();
    const database = await this.getDatabase();
    const transaction = database.transaction(["progress", "restore-checkpoints"], "readwrite");
    const storedProgress = await transaction.objectStore("progress").get(PROGRESS_KEY);
    const previousProgress = migrateProgress(storedProgress, this.now());

    if (storedProgress === undefined) {
      await transaction.objectStore("progress").put(previousProgress, PROGRESS_KEY);
    }
    await transaction.objectStore("restore-checkpoints").put(
      { token, previousProgress, expectedProgress },
      RESTORE_CHECKPOINT_KEY
    );
    await transaction.objectStore("progress").put(expectedProgress, PROGRESS_KEY);
    await transaction.done;
    return token;
  }

  public async rollbackRestore(
    token: RestoreToken,
    expectedProgress: LearnerProgressV1
  ): Promise<RestoreRollbackOutcome> {
    const database = await this.getDatabase();
    const transaction = database.transaction(["progress", "restore-checkpoints"], "readwrite");
    const checkpoint = await transaction.objectStore("restore-checkpoints").get(RESTORE_CHECKPOINT_KEY);

    if (
      !checkpoint ||
      checkpoint.token !== token ||
      !progressesEqual(checkpoint.expectedProgress, expectedProgress)
    ) {
      await transaction.done;
      return { status: "checkpoint-mismatch" };
    }

    const currentProgress = await transaction.objectStore("progress").get(PROGRESS_KEY);
    if (progressesEqual(currentProgress, expectedProgress)) {
      await transaction.objectStore("progress").put(checkpoint.previousProgress, PROGRESS_KEY);
      await transaction.objectStore("restore-checkpoints").delete(RESTORE_CHECKPOINT_KEY);
      await transaction.done;
      return { status: "rolled-back" };
    }

    await transaction.objectStore("restore-checkpoints").delete(RESTORE_CHECKPOINT_KEY);
    await transaction.done;
    return { status: "preserved-newer-state" };
  }

  public async finalizeRestore(
    token: RestoreToken,
    expectedProgress: LearnerProgressV1
  ): Promise<RestoreFinalizeOutcome> {
    const database = await this.getDatabase();
    const transaction = database.transaction(["progress", "restore-checkpoints"], "readwrite");
    const checkpoint = await transaction.objectStore("restore-checkpoints").get(RESTORE_CHECKPOINT_KEY);
    const currentProgress = await transaction.objectStore("progress").get(PROGRESS_KEY);

    if (
      !checkpoint ||
      checkpoint.token !== token ||
      !progressesEqual(checkpoint.expectedProgress, expectedProgress) ||
      !progressesEqual(currentProgress, expectedProgress)
    ) {
      await transaction.done;
      return { status: "checkpoint-mismatch" };
    }

    await transaction.objectStore("restore-checkpoints").delete(RESTORE_CHECKPOINT_KEY);
    await transaction.done;
    return { status: "finalized" };
  }

  public async reset(): Promise<void> {
    const database = await this.getDatabase();
    const transaction = database.transaction(
      ["progress", "recordings", "restore-checkpoints"],
      "readwrite"
    );

    await Promise.all([
      transaction.objectStore("progress").clear(),
      transaction.objectStore("recordings").clear(),
      transaction.objectStore("restore-checkpoints").clear()
    ]);
    await transaction.done;
  }

  public close(): void {
    const databasePromise = this.databasePromise;
    this.databasePromise = undefined;
    void databasePromise?.then((database) => database.close()).catch(() => undefined);
  }

  private getDatabase(): Promise<IDBPDatabase<ProgressDatabase>> {
    if (!this.databasePromise) {
      this.databasePromise = openDB<ProgressDatabase>(this.databaseName, DATABASE_VERSION, {
        upgrade(database) {
          if (!database.objectStoreNames.contains("progress")) {
            database.createObjectStore("progress");
          }
          if (!database.objectStoreNames.contains("recordings")) {
            database.createObjectStore("recordings");
          }
          if (!database.objectStoreNames.contains("restore-checkpoints")) {
            database.createObjectStore("restore-checkpoints");
          }
        }
      });
    }

    return this.databasePromise;
  }
}

function progressesEqual(storedProgress: unknown, expectedProgress: LearnerProgressV1): boolean {
  try {
    return stableJson(migrateProgress(storedProgress)) === stableJson(expectedProgress);
  } catch {
    return false;
  }
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function isPrefix(prefix: readonly string[], candidate: readonly string[]): boolean {
  return prefix.every((value, index) => candidate[index] === value);
}

function mergeCompletionEvent(
  current: readonly string[],
  incoming: readonly string[],
  exerciseId: string,
  rejectExistingExercise: boolean
): string[] {
  if (new Set(current).size !== current.length || new Set(incoming).size !== incoming.length) {
    throw new Error("completedExerciseIds must be unique");
  }
  if (incoming.at(-1) !== exerciseId) {
    throw new Error("lessonState must end with its completion event");
  }
  const previous = incoming.slice(0, -1);
  if (previous.length === current.length && isPrefix(previous, current)) return [...incoming];
  if (!rejectExistingExercise && isPrefix(previous, current) && current[previous.length] === exerciseId) {
    return [...current];
  }
  throw new Error("completion event does not follow stored authored order");
}

function attemptsEqual(left: Attempt, right: Attempt): boolean {
  return stableJson(left) === stableJson(right);
}

function mergeAttemptRecords(
  current: Record<string, Attempt[]> | undefined,
  incoming: Record<string, Attempt[]>
): Record<string, Attempt[]> {
  const merged: Record<string, Attempt[]> = {};
  const phraseIds = new Set([...Object.keys(current ?? {}), ...Object.keys(incoming)]);
  const attemptsById = new Map<string, { phraseId: string; attempt: Attempt }>();
  for (const [phraseId, history] of Object.entries(current ?? {})) {
    for (const attempt of history) {
      if (!attempt.attemptId) continue;
      const existing = attemptsById.get(attempt.attemptId);
      if (existing && (existing.phraseId !== phraseId || !attemptsEqual(existing.attempt, attempt))) {
        throw new Error(`stored attempt id collision: ${attempt.attemptId}`);
      }
      attemptsById.set(attempt.attemptId, { phraseId, attempt });
    }
  }

  for (const phraseId of phraseIds) {
    const currentHistory = [...(current?.[phraseId] ?? [])];
    const result = [...currentHistory];
    for (const [index, attempt] of (incoming[phraseId] ?? []).entries()) {
      if (attempt.attemptId) {
        const existing = attemptsById.get(attempt.attemptId);
        if (existing) {
          if (existing.phraseId !== phraseId || !attemptsEqual(existing.attempt, attempt)) {
            throw new Error(`attempt id collision: ${attempt.attemptId}`);
          }
          continue;
        }
        attemptsById.set(attempt.attemptId, { phraseId, attempt });
        result.push(attempt);
      } else if (!currentHistory[index] || !attemptsEqual(currentHistory[index], attempt)) {
        result.push(attempt);
      }
    }
    merged[phraseId] = result;
  }
  return merged;
}

function derivePhraseClasses(
  attemptsByPhrase: Record<string, Attempt[]>
): Record<string, AttemptClass> {
  const classes: Record<string, AttemptClass> = {};
  const rank: Record<AttemptClass, number> = {
    introduced: 0,
    practiced: 1,
    recalled: 2,
    mastered: 3
  };
  for (const [phraseId, history] of Object.entries(attemptsByPhrase)) {
    if (history.length === 0) continue;
    if (canMaster(history)) {
      classes[phraseId] = "mastered";
      continue;
    }
    let derived: AttemptClass = "introduced";
    history.forEach((attempt, index) => {
      const candidate = classifyAttempt({ ...attempt, history: history.slice(0, index) });
      if (rank[candidate] > rank[derived]) derived = candidate;
    });
    classes[phraseId] = derived;
  }
  return classes;
}
