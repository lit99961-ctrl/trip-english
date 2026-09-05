import { afterEach, describe, expect, test } from "vitest";
import { deleteDB } from "idb";
import type { LearnerProgressV1 } from "../../src/domain/progress";
import { IndexedDbProgressRepository } from "../../src/storage/indexeddb-progress-repository";
import type { ProgressRepository } from "../../src/storage/progress-repository";
import {
  createBackupDownload,
  decodeBackup,
  encodeBackup,
  inspectBackupImport,
  readBackupText,
  restorePreparedBackup
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
    JSON.stringify({
      format: "trip-english-backup",
      backupVersion: 1,
      exportedAt: "2026-09-05T08:00:00.000Z",
      courseVersion: "2026.09",
      progress: { ...progressFixture, schemaVersion: 99 }
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
});

describe("safe backup restore", () => {
  test("rejects an invalid backup without changing existing IndexedDB progress", async () => {
    const repository = createRepository();
    await repository.replaceProgress(progressFixture);
    const before = await repository.load();

    expect(() => inspectBackupImport('{"schemaVersion":99}')).toThrow(/unsupported backup/i);
    await expect(repository.load()).resolves.toEqual(before);
  });

  test("cancellation leaves progress unchanged", async () => {
    const repository = createRepository();
    await repository.replaceProgress(progressFixture);
    const prepared = inspectBackupImport(encodeBackup({ ...progressFixture, activeMissionId: "taxi" }));

    await expect(restorePreparedBackup(repository, prepared, false)).resolves.toMatchObject({
      restored: false,
      reason: "cancelled"
    });
    await expect(repository.load()).resolves.toEqual(progressFixture);
  });

  test("restores valid progress persistently without overwriting recordings", async () => {
    const repository = createRepository();
    const recording = new NodeBlob(["recording"], { type: "audio/webm" });
    await repository.replaceProgress({ ...progressFixture, activeMissionId: "airport" });
    await repository.saveRecording("hotel/listen-1", recording);
    const prepared = inspectBackupImport(encodeBackup(progressFixture));

    await expect(restorePreparedBackup(repository, prepared, () => true)).resolves.toMatchObject({
      restored: true,
      progress: progressFixture
    });
    await expect(repository.rollbackRestoreCheckpoint()).rejects.toThrow("checkpoint");
    expect(await repository.loadRecording("hotel/listen-1")).toMatchObject({
      size: recording.size,
      type: "audio/webm"
    });
    repository.close();

    const reopened = new IndexedDbProgressRepository(databaseNames[0]);
    repositories.push(reopened);
    await expect(reopened.load()).resolves.toEqual(progressFixture);
  });

  test("rolls back exact previous progress when reloading the restored state fails", async () => {
    const repository = new FaultInjectingRepository(progressFixture);
    const prepared = inspectBackupImport(encodeBackup({ ...progressFixture, activeMissionId: "taxi" }));
    repository.failNextLoadAfterReplacement = true;

    await expect(restorePreparedBackup(repository, prepared, true)).rejects.toThrow("reload failed");
    await expect(repository.load()).resolves.toEqual(progressFixture);
    expect(repository.checkpointPresent).toBe(true);
  });

  test("rolls back exact previous progress when replacement fails after mutation", async () => {
    const repository = new FaultInjectingRepository(progressFixture);
    const prepared = inspectBackupImport(encodeBackup({ ...progressFixture, activeMissionId: "taxi" }));
    repository.failNextReplaceAfterMutation = true;

    await expect(restorePreparedBackup(repository, prepared, true)).rejects.toThrow("replace failed");
    await expect(repository.load()).resolves.toEqual(progressFixture);
    expect(repository.checkpointPresent).toBe(true);
  });

  test("clears the restore checkpoint only after a successful reload", async () => {
    const repository = new FaultInjectingRepository(progressFixture);
    const prepared = inspectBackupImport(encodeBackup({ ...progressFixture, activeMissionId: "taxi" }));

    await restorePreparedBackup(repository, prepared, true);

    expect(repository.checkpointPresentWhenRestoredLoad).toBe(true);
    expect(repository.checkpointPresent).toBe(false);
  });
});

class FaultInjectingRepository implements ProgressRepository {
  public checkpointPresent = false;
  public failNextReplaceAfterMutation = false;
  public failNextLoadAfterReplacement = false;
  public checkpointPresentWhenRestoredLoad: boolean | undefined;
  private progress: LearnerProgressV1;
  private checkpoint: LearnerProgressV1 | undefined;
  private replaced = false;

  public constructor(progress: LearnerProgressV1) {
    this.progress = structuredClone(progress);
  }

  public async load(): Promise<LearnerProgressV1> {
    if (this.replaced) {
      this.checkpointPresentWhenRestoredLoad = this.checkpointPresent;
    }
    if (this.replaced && this.failNextLoadAfterReplacement) {
      this.failNextLoadAfterReplacement = false;
      throw new Error("reload failed");
    }
    return structuredClone(this.progress);
  }

  public async saveExerciseResult(): Promise<LearnerProgressV1> {
    return this.load();
  }

  public async saveRecording(): Promise<void> {}
  public async loadRecording(): Promise<Blob | undefined> {
    return undefined;
  }
  public async reset(): Promise<void> {}
  public close(): void {}

  public async createRestoreCheckpoint(): Promise<void> {
    this.checkpoint = structuredClone(this.progress);
    this.checkpointPresent = true;
  }

  public async replaceProgress(progress: LearnerProgressV1): Promise<void> {
    this.progress = structuredClone(progress);
    this.replaced = true;
    if (this.failNextReplaceAfterMutation) {
      this.failNextReplaceAfterMutation = false;
      throw new Error("replace failed");
    }
  }

  public async rollbackRestoreCheckpoint(): Promise<void> {
    if (!this.checkpoint) throw new Error("checkpoint missing");
    this.progress = structuredClone(this.checkpoint);
    this.replaced = false;
  }

  public async clearRestoreCheckpoint(): Promise<void> {
    this.checkpoint = undefined;
    this.checkpointPresent = false;
  }
}
