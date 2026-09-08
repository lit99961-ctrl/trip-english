import { afterEach, describe, expect, test } from "vitest";
import { deleteDB } from "idb";
import type { LearnerProgressV1 } from "../../src/domain/progress";
import { IndexedDbProgressRepository } from "../../src/storage/indexeddb-progress-repository";
import type { ProgressRepository } from "../../src/storage/progress-repository";
import {
  MAX_BACKUP_BYTES,
  createBackupDownload,
  decodeBackup,
  encodeBackup,
  inspectBackupImport,
  readBackupText,
  restoreBackup
} from "../../src/storage/backup-codec";

const NodeBlob = (await import("node:buffer" as string)).Blob as typeof Blob;
const databaseNames: string[] = [];
const repositories: IndexedDbProgressRepository[] = [];

const progressFixture: LearnerProgressV1 = {
  schemaVersion: 1,
  startedAt: "2026-09-01T12:00:00.000Z",
  activeMissionId: "hotel",
  sessions: {
    hotel: { missionId: "hotel", completedExerciseIds: ["listen-1", "speak-1"] },
    airport: { missionId: "airport", completedExerciseIds: ["check-in"] }
  },
  phraseReviews: {},
  savedPhraseIds: ["greeting"],
  speakingSeconds: 125,
  hintCount: 1,
  promptFreeScenarioIds: []
};

function createRepository() {
  const databaseName = `trip-english-backup-${crypto.randomUUID()}`;
  databaseNames.push(databaseName);
  const repository = new IndexedDbProgressRepository(databaseName, () =>
    new Date("2026-09-05T00:00:00.000Z")
  );
  repositories.push(repository);
  return repository;
}

function backupEnvelope(progress: unknown): string {
  return JSON.stringify({
    format: "trip-english-backup",
    backupVersion: 1,
    exportedAt: "2026-09-05T08:00:00.000Z",
    courseVersion: "2026.09",
    progress
  });
}

async function seed(repository: ProgressRepository, progress: LearnerProgressV1): Promise<void> {
  const token = await repository.beginRestore(progress);
  await repository.finalizeRestore(token, progress);
}

afterEach(async () => {
  repositories.splice(0).forEach((repository) => repository.close());
  await Promise.all(databaseNames.splice(0).map((name) => deleteDB(name)));
});

describe("backup codec", () => {
  test("encodes and decodes a deterministic progress backup", () => {
    const file = encodeBackup(progressFixture, {
      now: () => new Date("2026-09-05T08:00:00.000Z"),
      courseVersion: "2026.09"
    });

    expect(file).toBe(
      '{"format":"trip-english-backup","backupVersion":1,"exportedAt":"2026-09-05T08:00:00.000Z","courseVersion":"2026.09","progress":{"schemaVersion":1,"startedAt":"2026-09-01T12:00:00.000Z","activeMissionId":"hotel","sessions":{"hotel":{"missionId":"hotel","completedExerciseIds":["listen-1","speak-1"]},"airport":{"missionId":"airport","completedExerciseIds":["check-in"]}},"phraseReviews":{},"savedPhraseIds":["greeting"],"speakingSeconds":125,"hintCount":1,"promptFreeScenarioIds":[]}}'
    );
    expect(decodeBackup(file)).toEqual(progressFixture);
  });

  test.each([
    "not json",
    JSON.stringify({ format: "wrong", backupVersion: 1 }),
    JSON.stringify({ format: "trip-english-backup", backupVersion: 2 }),
    JSON.stringify({ schemaVersion: 99 }),
    backupEnvelope({ ...progressFixture, schemaVersion: 99 }),
    backupEnvelope({ ...progressFixture, unknownProgressField: true }),
    backupEnvelope({
      ...progressFixture,
      sessions: {
        hotel: { ...progressFixture.sessions.hotel, unknownSessionField: true }
      }
    }),
    backupEnvelope({
      ...progressFixture,
      phraseReviews: {
        greeting: {
          dueAt: "2026-09-02T12:00:00.000Z",
          successfulAttempts: 1,
          hintCount: 0,
          unknownReviewField: true
        }
      }
    })
  ])("rejects unsupported backup data", (file) => {
    expect(() => decodeBackup(file)).toThrow(/unsupported backup/i);
  });

  test("previews export metadata and transparent mission progress", () => {
    const prepared = inspectBackupImport(
      encodeBackup(progressFixture, {
        now: () => new Date("2026-09-05T08:00:00.000Z"),
        courseVersion: "2026.09"
      })
    );

    expect(prepared.preview).toEqual({
      exportedAt: "2026-09-05T08:00:00.000Z",
      courseVersion: "2026.09",
      missionsWithProgress: [
        { missionId: "hotel", completedExerciseIds: ["listen-1", "speak-1"], completedExerciseCount: 2 },
        { missionId: "airport", completedExerciseIds: ["check-in"], completedExerciseCount: 1 }
      ],
      missionCount: 2,
      speakingMinutes: 125 / 60
    });
  });

  test("creates a JSON download and reads imported Blob text", async () => {
    const download = createBackupDownload(progressFixture, {
      now: () => new Date("2026-09-05T08:00:00.000Z"),
      courseVersion: "2026.09"
    });

    expect(download.filename).toBe("trip-english-backup-2026-09-05.json");
    expect(download.blob.type).toBe("application/json");
    await expect(readBackupText(download.blob)).resolves.toBe(download.text);
    await expect(readBackupText(new NodeBlob([download.text]))).resolves.toBe(download.text);
  });

  test("rejects an oversized import before reading its text", async () => {
    const oversized = new NodeBlob(["x".repeat(MAX_BACKUP_BYTES + 1)]);

    await expect(readBackupText(oversized)).rejects.toThrow(/unsupported backup/i);
  });
});

describe("safe backup restore", () => {
  test("restores and projects a legacy backup through the public API", async () => {
    const repository = createRepository();
    await seed(repository, progressFixture);
    const legacy: LearnerProgressV1 = {
      ...progressFixture,
      activeMissionId: "legacy",
      sessions: {
        legacy: {
          missionId: "legacy", completedExerciseIds: ["old-1"],
          phraseAttempts: { help: [{
            supportLevel: "prompt-only", passed: true, answerRevealed: false,
            hintCount: 1, activity: "production"
          }] },
          phraseClasses: { help: "recalled" }
        }
      },
      phraseReviews: {},
      hintCount: 1
    };

    const result = await restoreBackup(repository, encodeBackup(legacy), true);

    expect(result).toMatchObject({
      restored: true,
      cleanupPending: false,
      progress: {
        activeMissionId: "legacy",
        reviewProjectionVersion: 1,
        phraseReviews: { help: { successfulAttempts: 1, hintCount: 1 } }
      }
    });
    await expect(repository.load()).resolves.toEqual(
      result.restored ? result.progress : undefined
    );
  });

  test("rejects an invalid backup without changing existing IndexedDB progress", async () => {
    const repository = createRepository();
    await seed(repository, progressFixture);
    const before = await repository.load();

    await expect(restoreBackup(repository, '{"schemaVersion":99}', true)).rejects.toThrow(
      /unsupported backup/i
    );
    await expect(repository.load()).resolves.toEqual(before);
  });

  test.each([
    backupEnvelope({ ...progressFixture, unknownProgressField: true }),
    backupEnvelope({
      ...progressFixture,
      sessions: { hotel: { ...progressFixture.sessions.hotel, unknownSessionField: true } }
    }),
    backupEnvelope({
      ...progressFixture,
      phraseReviews: {
        greeting: {
          dueAt: "2026-09-02T12:00:00.000Z",
          successfulAttempts: 1,
          hintCount: 0,
          unknownReviewField: true
        }
      }
    })
  ])("rejects unknown progress fields without mutation", async (file) => {
    const repository = createRepository();
    await seed(repository, progressFixture);

    await expect(restoreBackup(repository, file, true)).rejects.toThrow(/unsupported backup/i);
    await expect(repository.load()).resolves.toEqual(progressFixture);
  });

  test("cancellation leaves progress unchanged", async () => {
    const repository = createRepository();
    await seed(repository, progressFixture);
    const backup = encodeBackup({ ...progressFixture, activeMissionId: "taxi" });

    await expect(restoreBackup(repository, backup, false)).resolves.toMatchObject({
      restored: false,
      reason: "cancelled"
    });
    await expect(repository.load()).resolves.toEqual(progressFixture);
  });

  test("beginRestore atomically checkpoints and replaces real IndexedDB progress", async () => {
    const repository = createRepository();
    await seed(repository, progressFixture);
    const replacement = { ...progressFixture, activeMissionId: "taxi" };

    const token = await repository.beginRestore(replacement);

    await expect(repository.load()).resolves.toEqual(replacement);
    await expect(repository.rollbackRestore(token, replacement)).resolves.toEqual({ status: "rolled-back" });
    await expect(repository.load()).resolves.toEqual(progressFixture);
  });

  test("restores valid progress persistently without overwriting recordings", async () => {
    const repository = createRepository();
    const recording = new NodeBlob(["recording"], { type: "audio/webm" });
    await seed(repository, { ...progressFixture, activeMissionId: "airport" });
    await repository.saveRecording("hotel/listen-1", recording);
    const backup = encodeBackup(progressFixture);

    const result = await restoreBackup(repository, backup, () => true);
    expect(result).toMatchObject({
      restored: true,
      cleanupPending: false,
      progress: progressFixture
    });
    expect(result).not.toHaveProperty("cleanupHandle");
    expect(await repository.loadRecording("hotel/listen-1")).toMatchObject({
      size: recording.size,
      type: "audio/webm"
    });
    repository.close();

    const reopened = new IndexedDbProgressRepository(databaseNames[0]);
    repositories.push(reopened);
    await expect(reopened.load()).resolves.toEqual(progressFixture);
  });

  test("detects a schema-valid reloaded state that does not match the requested backup", async () => {
    const repository = new FaultInjectingRepository(progressFixture);
    repository.mismatchedReload = { ...progressFixture, activeMissionId: "taxi" };
    const backup = encodeBackup({ ...progressFixture, activeMissionId: "airport" });

    await expect(restoreBackup(repository, backup, true)).rejects.toThrow(/did not match/i);
    await expect(repository.load()).resolves.toEqual(progressFixture);
  });

  test("preserves a newer interleaving write when a restore verification fails", async () => {
    const repository = new FaultInjectingRepository(progressFixture);
    const newerProgress = { ...progressFixture, activeMissionId: "taxi" };
    repository.interleaveAfterBegin = newerProgress;
    const backup = encodeBackup({ ...progressFixture, activeMissionId: "airport" });

    await expect(restoreBackup(repository, backup, true)).rejects.toThrow(/did not match/i);
    await expect(repository.load()).resolves.toEqual(newerProgress);
    expect(repository.checkpointPresent).toBe(false);
  });

  test("reports superseded when a newer write happens after reload and before finalization", async () => {
    const repository = new FaultInjectingRepository(progressFixture);
    const newerProgress = { ...progressFixture, activeMissionId: "taxi" };
    repository.interleaveBeforeFinalize = newerProgress;

    await expect(
      restoreBackup(repository, encodeBackup({ ...progressFixture, activeMissionId: "airport" }), true)
    ).resolves.toEqual({ restored: false, reason: "superseded" });
    await expect(repository.load()).resolves.toEqual(newerProgress);
  });

  test("does not let a stale token finalize or roll back a newer attempt", async () => {
    const repository = createRepository();
    await seed(repository, progressFixture);
    const first = { ...progressFixture, activeMissionId: "airport" };
    const second = { ...progressFixture, activeMissionId: "taxi" };
    const firstToken = await repository.beginRestore(first);
    await repository.beginRestore(second);

    await expect(repository.finalizeRestore(firstToken, first)).resolves.toEqual({
      status: "checkpoint-mismatch"
    });
    await expect(repository.rollbackRestore(firstToken, first)).resolves.toEqual({
      status: "checkpoint-mismatch"
    });
    await expect(repository.load()).resolves.toEqual(second);
  });

  test("does not let a token paired with a newer snapshot roll back that newer progress", async () => {
    const repository = createRepository();
    await seed(repository, progressFixture);
    const token = await repository.beginRestore({ ...progressFixture, activeMissionId: "airport" });
    const newerProgress = await repository.saveExerciseResult({
      missionId: "taxi",
      exerciseId: "roleplay-1"
    });

    await expect(repository.rollbackRestore(token, newerProgress)).resolves.toEqual({
      status: "checkpoint-mismatch"
    });
    await expect(repository.load()).resolves.toEqual(newerProgress);
  });

  test("rolls back progress and clears its checkpoint after a finalize failure", async () => {
    const repository = new FaultInjectingRepository(progressFixture);
    repository.failFinalizeOnce = true;
    const restoredProgress = { ...progressFixture, activeMissionId: "taxi" };

    await expect(restoreBackup(repository, encodeBackup(restoredProgress), true))
      .rejects.toThrow("checkpoint cleanup failed");
    await expect(repository.load()).resolves.toEqual(progressFixture);
    expect(repository.checkpointPresent).toBe(false);
  });

  test("preserves a newer concurrent update while cleaning up a failed finalize", async () => {
    const repository = new FaultInjectingRepository(progressFixture);
    repository.failFinalizeOnce = true;
    const restoredProgress = { ...progressFixture, activeMissionId: "airport" };
    const newerProgress = { ...progressFixture, activeMissionId: "taxi" };
    repository.interleaveBeforeFinalize = newerProgress;

    await expect(restoreBackup(repository, encodeBackup(restoredProgress), true))
      .rejects.toThrow("checkpoint cleanup failed");
    await expect(repository.load()).resolves.toEqual(newerProgress);
    expect(repository.checkpointPresent).toBe(false);
  });

  test("rolls back the imported state when legacy projection validation fails", async () => {
    const repository = createRepository();
    await seed(repository, progressFixture);
    const invalidProjection: LearnerProgressV1 = {
      ...progressFixture,
      sessions: {
        legacy: {
          missionId: "legacy", completedExerciseIds: ["old"],
          phraseAttempts: { help: [{
            supportLevel: "prompt-only", passed: true, answerRevealed: false,
            timestamp: "9999-12-31T23:59:59.999Z", activity: "production"
          }] },
          phraseClasses: { help: "recalled" }
        }
      }
    };

    await expect(restoreBackup(repository, encodeBackup(invalidProjection), true)).rejects.toThrow();
    await expect(repository.load()).resolves.toEqual(progressFixture);
    await expect(restoreBackup(repository, encodeBackup(progressFixture), true)).resolves.toMatchObject({
      restored: true,
      cleanupPending: false
    });
  });
});

class FaultInjectingRepository implements ProgressRepository {
  public checkpointPresent = false;
  public mismatchedReload: LearnerProgressV1 | undefined;
  public interleaveAfterBegin: LearnerProgressV1 | undefined;
  public interleaveBeforeFinalize: LearnerProgressV1 | undefined;
  public failFinalizeOnce = false;
  private progress: LearnerProgressV1;
  private checkpoint:
    | { token: string; previous: LearnerProgressV1; expected: LearnerProgressV1 }
    | undefined;
  private tokenNumber = 0;

  public constructor(progress: LearnerProgressV1) {
    this.progress = structuredClone(progress);
  }

  public async load(): Promise<LearnerProgressV1> {
    if (this.interleaveAfterBegin && this.checkpoint) {
      this.progress = structuredClone(this.interleaveAfterBegin);
      this.interleaveAfterBegin = undefined;
    }
    if (this.mismatchedReload) {
      const mismatch = this.mismatchedReload;
      this.mismatchedReload = undefined;
      return structuredClone(mismatch);
    }
    return structuredClone(this.progress);
  }

  public async saveExerciseResult(): Promise<LearnerProgressV1> {
    return this.load();
  }

  public async saveCalibrationResult(): Promise<LearnerProgressV1> {
    return this.load();
  }

  public async savePhraseId(): Promise<LearnerProgressV1> {
    return this.load();
  }

  public async saveLookup(): Promise<LearnerProgressV1> {
    return this.load();
  }

  public async ensureDailyPlan(): Promise<LearnerProgressV1> {
    return this.load();
  }

  public async advanceMissionIntroduction(): Promise<LearnerProgressV1> {
    return this.load();
  }

  public async saveRecording(): Promise<void> {}
  public async loadRecording(): Promise<Blob | undefined> {
    return undefined;
  }
  public async reset(): Promise<void> {}
  public close(): void {}

  public async beginRestore(progress: LearnerProgressV1): Promise<string> {
    const token = `restore-${++this.tokenNumber}`;
    this.checkpoint = {
      token,
      previous: structuredClone(this.progress),
      expected: structuredClone(progress)
    };
    this.checkpointPresent = true;
    this.progress = structuredClone(progress);
    return token;
  }

  public async rollbackRestore(token: string, expected: LearnerProgressV1) {
    if (!this.checkpoint || this.checkpoint.token !== token || !sameProgress(this.checkpoint.expected, expected)) {
      return { status: "checkpoint-mismatch" as const };
    }
    if (!sameProgress(this.progress, expected)) {
      this.checkpoint = undefined;
      this.checkpointPresent = false;
      return { status: "preserved-newer-state" as const };
    }
    this.progress = structuredClone(this.checkpoint.previous);
    this.checkpoint = undefined;
    this.checkpointPresent = false;
    return { status: "rolled-back" as const };
  }

  public async finalizeRestore(token: string, expected: LearnerProgressV1) {
    if (this.interleaveBeforeFinalize && this.checkpoint) {
      this.progress = structuredClone(this.interleaveBeforeFinalize);
      this.interleaveBeforeFinalize = undefined;
    }
    if (this.failFinalizeOnce) {
      this.failFinalizeOnce = false;
      throw new Error("checkpoint cleanup failed");
    }
    if (
      !this.checkpoint ||
      this.checkpoint.token !== token ||
      !sameProgress(this.checkpoint.expected, expected) ||
      !sameProgress(this.progress, expected)
    ) {
      return { status: "checkpoint-mismatch" as const };
    }
    this.checkpoint = undefined;
    this.checkpointPresent = false;
    return { status: "finalized" as const };
  }
}

function sameProgress(left: LearnerProgressV1, right: LearnerProgressV1): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
