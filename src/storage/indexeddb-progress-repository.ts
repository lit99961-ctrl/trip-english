import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import {
  createLearnerProgressV1,
  migrateProgress,
  type LearnerProgressV1
} from "../domain/progress";
import type { ProgressRepository, SaveExerciseResultInput } from "./progress-repository";

const DATABASE_VERSION = 1;
const PROGRESS_KEY = "learner-progress";

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
    value: unknown;
  };
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
    const database = await this.getDatabase();
    const transaction = database.transaction("progress", "readwrite");
    const storedProgress = await transaction.store.get(PROGRESS_KEY);
    const progress = migrateProgress(storedProgress, this.now());
    const session = progress.sessions[input.missionId] ?? {
      missionId: input.missionId,
      completedExerciseIds: []
    };
    const completedExerciseIds = session.completedExerciseIds.includes(input.exerciseId)
      ? session.completedExerciseIds
      : [...session.completedExerciseIds, input.exerciseId];
    const nextProgress: LearnerProgressV1 = {
      ...progress,
      activeMissionId: input.missionId,
      sessions: {
        ...progress.sessions,
        [input.missionId]: { ...session, completedExerciseIds }
      }
    };

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
