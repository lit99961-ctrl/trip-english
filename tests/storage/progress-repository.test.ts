import { afterEach, describe, expect, test } from "vitest";
import { deleteDB } from "idb";
import { migrateProgress } from "../../src/domain/progress";
import { IndexedDbProgressRepository } from "../../src/storage/indexeddb-progress-repository";

const databaseNames: string[] = [];
const repositories: IndexedDbProgressRepository[] = [];
const NodeBlob = (await import("node:buffer" as string)).Blob as typeof Blob;

function createRepository() {
  const databaseName = `trip-english-progress-${crypto.randomUUID()}`;
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

describe("LearnerProgressV1 migration", () => {
  test("accepts a valid v1 progress document", () => {
    const progress = migrateProgress({
      schemaVersion: 1,
      startedAt: "2026-09-01T12:00:00.000Z",
      activeMissionId: "hotel",
      sessions: { hotel: { missionId: "hotel", completedExerciseIds: ["listen-1"] } },
      phraseReviews: {
        greeting: {
          dueAt: "2026-09-02T12:00:00.000Z",
          successfulAttempts: 1,
          hintCount: 0
        }
      },
      savedPhraseIds: ["greeting"],
      speakingSeconds: 5,
      hintCount: 1,
      promptFreeScenarioIds: ["hotel-checkin"]
    });

    expect(progress.activeMissionId).toBe("hotel");
    expect(progress.sessions.hotel!.completedExerciseIds).toEqual(["listen-1"]);
  });

  test("rejects malformed v1 progress", () => {
    expect(() =>
      migrateProgress({
        schemaVersion: 1,
        startedAt: "not-a-date",
        activeMissionId: null,
        sessions: {},
        phraseReviews: {},
        savedPhraseIds: [],
        speakingSeconds: 0,
        hintCount: 0,
        promptFreeScenarioIds: []
      })
    ).toThrow();
  });

  test("rejects unknown future schema versions", () => {
    expect(() => migrateProgress({ schemaVersion: 2 })).toThrow();
  });
});

describe("IndexedDbProgressRepository", () => {
  test("a fresh repository returns valid v1 defaults", async () => {
    const repository = createRepository();

    await expect(repository.load()).resolves.toEqual({
      schemaVersion: 1,
      startedAt: "2026-09-05T00:00:00.000Z",
      activeMissionId: null,
      sessions: {},
      phraseReviews: {},
      savedPhraseIds: [],
      speakingSeconds: 0,
      hintCount: 0,
      promptFreeScenarioIds: []
    });

  });

  test("materializes initial progress so startedAt survives reopening", async () => {
    const repository = createRepository();
    const initialProgress = await repository.load();
    repository.close();

    const reopened = new IndexedDbProgressRepository(databaseNames[0], () =>
      new Date("2026-09-06T00:00:00.000Z")
    );
    repositories.push(reopened);

    await expect(reopened.load()).resolves.toMatchObject({
      startedAt: initialProgress.startedAt
    });
  });

  test("reopening restores the active mission and completed exercise", async () => {
    const repository = createRepository();
    await repository.saveExerciseResult({ missionId: "hotel", exerciseId: "listen-1" });
    repository.close();

    const reopened = new IndexedDbProgressRepository(databaseNames[0], () =>
      new Date("2026-09-05T00:00:00.000Z")
    );
    repositories.push(reopened);
    const progress = await reopened.load();

    expect(progress.activeMissionId).toBe("hotel");
    expect(progress.sessions.hotel!.completedExerciseIds).toEqual(["listen-1"]);
  });

  test("repeating an exercise result is idempotent and preserves prior sessions", async () => {
    const repository = createRepository();
    await repository.saveExerciseResult({ missionId: "airport", exerciseId: "check-in" });
    await repository.saveExerciseResult({ missionId: "hotel", exerciseId: "listen-1" });
    await repository.saveExerciseResult({ missionId: "hotel", exerciseId: "listen-1" });

    const progress = await repository.load();

    expect(progress.activeMissionId).toBe("hotel");
    expect(progress.sessions.airport!.completedExerciseIds).toEqual(["check-in"]);
    expect(progress.sessions.hotel!.completedExerciseIds).toEqual(["listen-1"]);
  });

  test("stores recordings by their stable key", async () => {
    const repository = createRepository();
    const recording = new NodeBlob(["spoken response"], { type: "audio/webm" });

    await repository.saveRecording("hotel/listen-1", recording);

    const loaded = await repository.loadRecording("hotel/listen-1");
    expect(loaded).toBeInstanceOf(NodeBlob);
    expect(loaded?.size).toBe(recording.size);
    expect(loaded?.type).toBe("audio/webm");
  });

  test("reset clears progress and recordings while leaving the repository usable", async () => {
    const repository = createRepository();
    await repository.saveExerciseResult({ missionId: "hotel", exerciseId: "listen-1" });
    await repository.saveRecording("hotel/listen-1", new NodeBlob(["recording"]));

    await repository.reset();

    const progress = await repository.load();
    expect(progress.activeMissionId).toBeNull();
    expect(progress.sessions).toEqual({});
    await expect(repository.loadRecording("hotel/listen-1")).resolves.toBeUndefined();

    await repository.saveExerciseResult({ missionId: "taxi", exerciseId: "roleplay-1" });
    await expect(repository.load()).resolves.toMatchObject({ activeMissionId: "taxi" });
  });
});
