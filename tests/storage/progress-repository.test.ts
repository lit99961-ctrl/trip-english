import { afterEach, describe, expect, test } from "vitest";
import { deleteDB } from "idb";
import { createLearnerProgressV1, migrateProgress } from "../../src/domain/progress";
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

  test("rejects persisted sessions with duplicate completed exercise IDs", () => {
    const progress = createLearnerProgressV1();
    progress.sessions.hotel = {
      missionId: "hotel",
      completedExerciseIds: ["e1", "e1"]
    };

    expect(() => migrateProgress(progress)).toThrow("unique");
  });
});

describe("IndexedDbProgressRepository", () => {
  test("atomically saves phrase favorites and normalized lookup history", async () => {
    const repository = createRepository();

    await repository.savePhraseId("em-help-112");
    await repository.savePhraseId("em-help-112");
    await repository.saveLookup({
      text: "  The TRAIN  ",
      knownWords: ["Train", "the", "train"],
      savedAt: "2026-09-05T00:00:00.000Z"
    });

    await expect(repository.load()).resolves.toMatchObject({
      savedPhraseIds: ["em-help-112"],
      knownWords: ["the", "train"],
      lookupHistory: [{
        text: "The TRAIN",
        knownWords: ["the", "train"],
        savedAt: "2026-09-05T00:00:00.000Z"
      }]
    });
  });

  test("rejects empty or noncanonical lookup persistence input", async () => {
    const repository = createRepository();
    await expect(repository.savePhraseId(" ")).rejects.toThrow();
    await expect(repository.saveLookup({ text: " ", knownWords: [], savedAt: "bad" })).rejects.toThrow();
  });

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

  test("atomically persists lesson attempts, classifications, and cumulative speaking time", async () => {
    const repository = createRepository();
    const lessonState = {
      completedExerciseIds: ["listen-1"],
      phraseAttempts: {
        reservation: [{
          supportLevel: "full" as const,
          passed: true,
          answerRevealed: true,
          activity: "production" as const
        }]
      },
      phraseClasses: { reservation: "practiced" as const }
    };

    await repository.saveExerciseResult({
      missionId: "hotel",
      exerciseId: "listen-1",
      lessonState,
      speakingSeconds: 3.4
    });
    repository.close();
    const reopened = new IndexedDbProgressRepository(databaseNames[0]);
    repositories.push(reopened);

    await expect(reopened.load()).resolves.toMatchObject({
      speakingSeconds: 3.4,
      sessions: {
        hotel: {
          completedExerciseIds: ["listen-1"],
          phraseAttempts: lessonState.phraseAttempts,
          phraseClasses: lessonState.phraseClasses
        }
      }
    });
  });

  test("persists calibration result with recoverable recording keys", async () => {
    const repository = createRepository();
    const recording = new NodeBlob(["baseline voice"], { type: "audio/webm" });
    await repository.saveRecording("baseline/speaking-1", recording);

    await repository.saveCalibrationResult({
      supportLevel: "full",
      correctItems: 2,
      speakingSeconds: 4,
      completedAt: "2026-09-05T00:02:00.000Z",
      recordingKeys: ["baseline/speaking-1"]
    });
    repository.close();
    const reopened = new IndexedDbProgressRepository(databaseNames[0]);
    repositories.push(reopened);

    await expect(reopened.load()).resolves.toMatchObject({
      calibration: {
        supportLevel: "full",
        recordingKeys: ["baseline/speaking-1"]
      }
    });
    await expect(reopened.loadRecording("baseline/speaking-1")).resolves.toMatchObject({
      size: recording.size,
      type: recording.type
    });
  });

  test("rejects invalid lesson metrics without corrupting stored progress", async () => {
    const repository = createRepository();

    await expect(repository.saveExerciseResult({
      missionId: "hotel",
      exerciseId: "listen-1",
      speakingSeconds: -1
    })).rejects.toThrow();

    await expect(repository.load()).resolves.toMatchObject({
      speakingSeconds: 0,
      sessions: {}
    });
  });

  test("does not let a stale writer roll back completed work or delete attempts", async () => {
    const repository = createRepository();
    const secondRepository = new IndexedDbProgressRepository(databaseNames[0]);
    repositories.push(secondRepository);
    await secondRepository.load(); // This instance now represents an older open lesson view.
    const supportedAttempt = {
      attemptId: "attempt-a",
      supportLevel: "full" as const,
      passed: true,
      answerRevealed: true,
      activity: "production" as const
    };
    const independentAttempt = {
      attemptId: "attempt-b",
      supportLevel: "prompt-only" as const,
      passed: true,
      answerRevealed: false,
      activity: "production" as const
    };
    const staleNewAttempt = {
      attemptId: "attempt-c",
      supportLevel: "english" as const,
      passed: true,
      answerRevealed: false,
      activity: "production" as const
    };

    await repository.saveExerciseResult({
      missionId: "hotel",
      exerciseId: "e1",
      lessonState: {
        completedExerciseIds: ["e1"],
        phraseAttempts: { reservation: [supportedAttempt] },
        phraseClasses: { reservation: "practiced" }
      },
      speakingSeconds: 3
    });
    await repository.saveExerciseResult({
      missionId: "hotel",
      exerciseId: "e2",
      lessonState: {
        completedExerciseIds: ["e1", "e2"],
        phraseAttempts: { reservation: [supportedAttempt, independentAttempt] },
        phraseClasses: { reservation: "recalled" }
      },
      speakingSeconds: 8
    });
    await secondRepository.saveExerciseResult({
      missionId: "hotel",
      exerciseId: "e1",
      lessonState: {
        completedExerciseIds: ["e1"],
        phraseAttempts: { reservation: [supportedAttempt, staleNewAttempt] },
        phraseClasses: { reservation: "introduced" }
      },
      speakingSeconds: 3
    });

    const stored = await repository.load();
    expect(stored.sessions.hotel!.completedExerciseIds).toEqual(["e1", "e2"]);
    expect(stored.sessions.hotel!.phraseAttempts!.reservation!.map((attempt) => attempt.attemptId))
      .toEqual(["attempt-a", "attempt-b", "attempt-c"]);
    expect(stored.sessions.hotel!.phraseClasses!.reservation).toBe("mastered");
    expect(stored.speakingSeconds).toBe(8);
  });

  test("rejects a full-state write that skips an unseen completion event", async () => {
    const repository = createRepository();

    await expect(repository.saveExerciseResult({
      missionId: "hotel",
      exerciseId: "e2",
      lessonState: {
        completedExerciseIds: ["e1", "e2"],
        phraseAttempts: {},
        phraseClasses: {}
      }
    })).rejects.toThrow("completion event");

    await expect(repository.load()).resolves.toMatchObject({ sessions: {} });
  });

  test("derives phrase class from attempts instead of trusting a forged mastered class", async () => {
    const repository = createRepository();

    await repository.saveExerciseResult({
      missionId: "hotel",
      exerciseId: "e1",
      lessonState: {
        completedExerciseIds: ["e1"],
        phraseAttempts: {
          reservation: [{
            attemptId: "single-supported",
            supportLevel: "full",
            passed: true,
            answerRevealed: true,
            activity: "production"
          }]
        },
        phraseClasses: { reservation: "mastered" }
      }
    });

    const stored = await repository.load();
    expect(stored.sessions.hotel!.phraseClasses!.reservation).toBe("practiced");
  });

  test("adds speaking deltas from interleaved old views and applies retries exactly once", async () => {
    const repository = createRepository();
    const oldViewRepository = new IndexedDbProgressRepository(databaseNames[0]);
    repositories.push(oldViewRepository);
    const staleTotal = (await oldViewRepository.load()).speakingSeconds;

    await repository.saveExerciseResult({
      missionId: "hotel",
      exerciseId: "e1",
      eventId: "event-a",
      speakingSecondsDelta: 3,
      speakingSeconds: staleTotal + 3,
      lessonState: {
        completedExerciseIds: ["e1"],
        phraseAttempts: {},
        phraseClasses: {}
      }
    });
    const secondEvent = {
      missionId: "hotel",
      exerciseId: "e2",
      eventId: "event-b",
      speakingSecondsDelta: 5,
      speakingSeconds: staleTotal + 5,
      lessonState: {
        completedExerciseIds: ["e1", "e2"],
        phraseAttempts: {},
        phraseClasses: {}
      }
    };
    await oldViewRepository.saveExerciseResult(secondEvent);
    await oldViewRepository.saveExerciseResult(secondEvent);

    const stored = await repository.load();
    expect(stored.speakingSeconds).toBe(8);
    expect(stored.sessions.hotel!.completedExerciseIds).toEqual(["e1", "e2"]);
  });

  test.each([-1, Number.POSITIVE_INFINITY, 3_601])(
    "rejects an unsafe per-exercise speaking delta of %s",
    async (speakingSecondsDelta) => {
      const repository = createRepository();

      await expect(repository.saveExerciseResult({
        missionId: "hotel",
        exerciseId: "e1",
        eventId: "unsafe-delta",
        speakingSecondsDelta,
        lessonState: {
          completedExerciseIds: ["e1"],
          phraseAttempts: {},
          phraseClasses: {}
        }
      })).rejects.toThrow("outside the allowed range");
      expect((await repository.load()).sessions).toEqual({});
    }
  );

  test("rejects an event-id collision when the normalized payload differs", async () => {
    const repository = createRepository();
    const first = {
      missionId: "hotel",
      exerciseId: "e1",
      eventId: "same-event",
      speakingSecondsDelta: 3,
      lessonState: {
        completedExerciseIds: ["e1"],
        phraseAttempts: {},
        phraseClasses: {}
      }
    };
    await repository.saveExerciseResult(first);

    await expect(repository.saveExerciseResult({
      ...first,
      speakingSecondsDelta: 4
    })).rejects.toThrow("collision");
    expect((await repository.load()).speakingSeconds).toBe(3);
  });

  test("rejects an attempt-id collision when its normalized attempt differs", async () => {
    const repository = createRepository();
    const firstAttempt = {
      attemptId: "same-attempt",
      supportLevel: "full" as const,
      passed: true,
      answerRevealed: true,
      activity: "production" as const
    };
    await repository.saveExerciseResult({
      missionId: "hotel",
      exerciseId: "e1",
      eventId: "event-one",
      speakingSecondsDelta: 0,
      lessonState: {
        completedExerciseIds: ["e1"],
        phraseAttempts: { reservation: [firstAttempt] },
        phraseClasses: { reservation: "practiced" }
      }
    });

    await expect(repository.saveExerciseResult({
      missionId: "hotel",
      exerciseId: "e2",
      eventId: "event-two",
      speakingSecondsDelta: 0,
      lessonState: {
        completedExerciseIds: ["e1", "e2"],
        phraseAttempts: {
          reservation: [{ ...firstAttempt, passed: false }]
        },
        phraseClasses: { reservation: "introduced" }
      }
    })).rejects.toThrow("attempt id collision");

    expect((await repository.load()).sessions.hotel!.completedExerciseIds).toEqual(["e1"]);
  });

  test("rejects duplicate completed exercise IDs in new events", async () => {
    const repository = createRepository();
    await repository.saveExerciseResult({
      missionId: "hotel",
      exerciseId: "e1",
      eventId: "event-e1",
      speakingSecondsDelta: 0,
      lessonState: {
        completedExerciseIds: ["e1"],
        phraseAttempts: {},
        phraseClasses: {}
      }
    });

    await expect(repository.saveExerciseResult({
      missionId: "hotel",
      exerciseId: "e1",
      eventId: "duplicate-e1",
      speakingSecondsDelta: 0,
      lessonState: {
        completedExerciseIds: ["e1", "e1"],
        phraseAttempts: {},
        phraseClasses: {}
      }
    })).rejects.toThrow("unique");
    await expect(repository.saveExerciseResult({
      missionId: "hotel",
      exerciseId: "e1",
      eventId: "loop-to-e1",
      speakingSecondsDelta: 0,
      lessonState: {
        completedExerciseIds: ["e1", "e2", "e1"],
        phraseAttempts: {},
        phraseClasses: {}
      }
    })).rejects.toThrow("unique");
    expect((await repository.load()).sessions.hotel!.completedExerciseIds).toEqual(["e1"]);
  });

  test("updates review metrics and prompt-free scenarios exactly once per learning event", async () => {
    const repository = createRepository();
    const phraseId = "reservation";
    const supportedAt = "2026-09-05T10:00:00.000Z";
    const supportedAttempt = {
      attemptId: "review-a", supportLevel: "english" as const, passed: true,
      answerRevealed: false, hintCount: 1, timestamp: supportedAt,
      activity: "production" as const
    };
    const firstEvent = {
      missionId: "hotel",
      exerciseId: "e1",
      eventId: "review-event-a",
      speakingSecondsDelta: 0,
      attemptEvent: {
        attemptId: "review-a", phraseId, missionId: "hotel", hintUsed: true,
        occurredAt: supportedAt
      },
      lessonState: {
        completedExerciseIds: ["e1"],
        phraseAttempts: { [phraseId]: [supportedAttempt] },
        phraseClasses: { [phraseId]: "practiced" as const }
      }
    };
    await repository.saveExerciseResult(firstEvent);
    await repository.saveExerciseResult(firstEvent);
    let stored = await repository.load();
    expect(stored.phraseReviews[phraseId]).toMatchObject({
      dueAt: "2026-09-06T10:00:00.000Z",
      successfulAttempts: 1,
      hintCount: 1
    });
    expect(stored.hintCount).toBe(1);

    const promptFreeAt = "2026-09-06T10:00:00.000Z";
    const promptFreeAttempt = {
      attemptId: "review-b", supportLevel: "prompt-only" as const, passed: true,
      answerRevealed: false, hintCount: 0, timestamp: promptFreeAt,
      activity: "production" as const
    };
    await repository.saveExerciseResult({
      missionId: "hotel", exerciseId: "e2", eventId: "review-event-b",
      speakingSecondsDelta: 0,
      attemptEvent: {
        attemptId: "review-b", phraseId, missionId: "hotel", scenarioId: "hotel-roleplay",
        hintUsed: false, occurredAt: promptFreeAt
      },
      lessonState: {
        completedExerciseIds: ["e1", "e2"],
        phraseAttempts: { [phraseId]: [supportedAttempt, promptFreeAttempt] },
        phraseClasses: { [phraseId]: "recalled" }
      }
    });
    stored = await repository.load();
    expect(stored.phraseReviews[phraseId]!.dueAt).toBe("2026-09-09T10:00:00.000Z");
    expect(stored.promptFreeScenarioIds).toEqual(["hotel-roleplay"]);
    expect(stored.phraseReviews[phraseId]!.masteredAt).toBeUndefined();

    const masteredAt = "2026-09-07T10:00:00.000Z";
    const thirdAttempt = {
      attemptId: "review-c", supportLevel: "english" as const, passed: true,
      answerRevealed: false, hintCount: 0, timestamp: masteredAt,
      activity: "production" as const
    };
    await repository.saveExerciseResult({
      missionId: "hotel", exerciseId: "e3", eventId: "review-event-c",
      speakingSecondsDelta: 0,
      attemptEvent: {
        attemptId: "review-c", phraseId, missionId: "hotel", hintUsed: false,
        occurredAt: masteredAt
      },
      lessonState: {
        completedExerciseIds: ["e1", "e2", "e3"],
        phraseAttempts: { [phraseId]: [supportedAttempt, promptFreeAttempt, thirdAttempt] },
        phraseClasses: { [phraseId]: "mastered" }
      }
    });
    stored = await repository.load();
    expect(stored.phraseReviews[phraseId]!.masteredAt).toBe(masteredAt);
    expect(stored.phraseReviews[phraseId]!.successfulAttempts).toBe(3);
  });

  test("schedules a failed self-rating in the same session", async () => {
    const repository = createRepository();
    const occurredAt = "2026-09-05T10:00:00.000Z";
    const attempt = {
      attemptId: "failed-a", supportLevel: "partial" as const, passed: false,
      answerRevealed: false, hintCount: 1, timestamp: occurredAt,
      activity: "production" as const
    };
    await repository.saveExerciseResult({
      missionId: "hotel", exerciseId: "e1", eventId: "failed-event",
      speakingSecondsDelta: 0,
      attemptEvent: {
        attemptId: "failed-a", phraseId: "reservation", missionId: "hotel",
        hintUsed: true, occurredAt
      },
      lessonState: {
        completedExerciseIds: ["e1"],
        phraseAttempts: { reservation: [attempt] },
        phraseClasses: { reservation: "practiced" }
      }
    });

    const stored = await repository.load();
    expect(stored.phraseReviews.reservation).toMatchObject({
      dueAt: "2026-09-05T10:10:00.000Z",
      successfulAttempts: 0,
      hintCount: 1
    });
  });

  test("rejects reusing an attempt under a different learning event", async () => {
    const repository = createRepository();
    const occurredAt = "2026-09-05T10:00:00.000Z";
    const attempt = {
      attemptId: "attempt-once", supportLevel: "english" as const, passed: true,
      answerRevealed: false, hintCount: 1, timestamp: occurredAt,
      activity: "production" as const
    };
    const first = {
      missionId: "hotel", exerciseId: "e1", eventId: "event-once",
      speakingSecondsDelta: 0,
      attemptEvent: {
        attemptId: "attempt-once", phraseId: "reservation", missionId: "hotel",
        hintUsed: true, occurredAt
      },
      lessonState: {
        completedExerciseIds: ["e1"],
        phraseAttempts: { reservation: [attempt] },
        phraseClasses: { reservation: "practiced" as const }
      }
    };
    await repository.saveExerciseResult(first);

    await expect(repository.saveExerciseResult({
      ...first,
      exerciseId: "e2",
      eventId: "different-event",
      lessonState: { ...first.lessonState, completedExerciseIds: ["e1", "e2"] }
    })).rejects.toThrow("attempt event was already processed");
    expect((await repository.load()).hintCount).toBe(1);
  });

  test("requires exactly-once event fields when attempt metrics are submitted", async () => {
    const repository = createRepository();
    await expect(repository.saveExerciseResult({
      missionId: "hotel",
      exerciseId: "e1",
      attemptEvent: {
        attemptId: "orphan-attempt", phraseId: "reservation", missionId: "hotel",
        hintUsed: false, occurredAt: "2026-09-05T10:00:00.000Z"
      }
    })).rejects.toThrow("attemptEvent requires an exactly-once exercise event");
  });

  test("merges review metrics from interleaved repository instances", async () => {
    const repository = createRepository();
    const oldViewRepository = new IndexedDbProgressRepository(databaseNames[0]);
    repositories.push(oldViewRepository);
    await oldViewRepository.load();
    const firstAt = "2026-09-05T10:00:00.000Z";
    const secondAt = "2026-09-05T10:01:00.000Z";

    await repository.saveExerciseResult({
      missionId: "hotel", exerciseId: "h1", eventId: "metric-a", speakingSecondsDelta: 0,
      attemptEvent: {
        attemptId: "metric-attempt-a", phraseId: "help", missionId: "hotel",
        scenarioId: "hotel-help", hintUsed: false, occurredAt: firstAt
      },
      lessonState: {
        completedExerciseIds: ["h1"],
        phraseAttempts: { help: [{
          attemptId: "metric-attempt-a", supportLevel: "prompt-only", passed: true,
          answerRevealed: false, hintCount: 0, timestamp: firstAt, activity: "production"
        }] },
        phraseClasses: { help: "recalled" }
      }
    });
    await oldViewRepository.saveExerciseResult({
      missionId: "train", exerciseId: "t1", eventId: "metric-b", speakingSecondsDelta: 0,
      attemptEvent: {
        attemptId: "metric-attempt-b", phraseId: "help", missionId: "train",
        hintUsed: true, occurredAt: secondAt
      },
      lessonState: {
        completedExerciseIds: ["t1"],
        phraseAttempts: { help: [{
          attemptId: "metric-attempt-b", supportLevel: "english", passed: true,
          answerRevealed: false, hintCount: 1, timestamp: secondAt, activity: "production"
        }] },
        phraseClasses: { help: "practiced" }
      }
    });

    const stored = await repository.load();
    expect(stored.phraseReviews.help).toMatchObject({ successfulAttempts: 2, hintCount: 1 });
    expect(stored.hintCount).toBe(1);
    expect(stored.promptFreeScenarioIds).toEqual(["hotel-help"]);
  });

  test("schedules a supported attempt normally after mastery without moving masteredAt", async () => {
    const repository = createRepository();
    const times = [
      "2026-09-01T10:00:00.000Z",
      "2026-09-02T10:00:00.000Z",
      "2026-09-03T10:00:00.000Z",
      "2026-09-04T10:00:00.000Z"
    ];
    const attempts = times.map((timestamp, index) => ({
      attemptId: `mastered-history-${index}`,
      supportLevel: (index === 1 ? "prompt-only" : "english") as "prompt-only" | "english",
      passed: true,
      answerRevealed: false,
      hintCount: index === 3 ? 1 : 0,
      timestamp,
      activity: "production" as const
    }));
    for (let index = 0; index < attempts.length; index += 1) {
      const attempt = attempts[index]!;
      await repository.saveExerciseResult({
        missionId: "hotel", exerciseId: `e${index + 1}`, eventId: `master-event-${index}`,
        speakingSecondsDelta: 0,
        attemptEvent: {
          attemptId: attempt.attemptId, phraseId: "reservation", missionId: "hotel",
          ...(index === 1 ? { scenarioId: "hotel-roleplay" } : {}),
          hintUsed: (attempt.hintCount ?? 0) > 0, occurredAt: attempt.timestamp
        },
        lessonState: {
          completedExerciseIds: attempts.slice(0, index + 1).map((_, itemIndex) => `e${itemIndex + 1}`),
          phraseAttempts: { reservation: attempts.slice(0, index + 1) },
          phraseClasses: { reservation: index >= 2 ? "mastered" : "practiced" }
        }
      });
    }

    const review = (await repository.load()).phraseReviews.reservation!;
    expect(review.masteredAt).toBe(times[2]);
    expect(review.dueAt).toBe("2026-09-05T10:00:00.000Z");
    expect(review).toMatchObject({
      lastAttemptOccurredAt: times[3],
      lastScheduleEventId: "master-event-3"
    });
  });

  test("produces the same mastery schedule when older attempt events arrive late", async () => {
    const chronological = createRepository();
    const outOfOrder = createRepository();
    const outOfOrderSecondView = new IndexedDbProgressRepository(databaseNames.at(-1)!);
    repositories.push(outOfOrderSecondView);
    const events = [
      { missionId: "early", eventId: "event-a", occurredAt: "2026-09-01T10:00:00.000Z", supportLevel: "english" as const, hintCount: 1 },
      { missionId: "middle", eventId: "event-b", occurredAt: "2026-09-02T10:00:00.000Z", supportLevel: "prompt-only" as const, hintCount: 0 },
      { missionId: "latest", eventId: "event-c", occurredAt: "2026-09-03T10:00:00.000Z", supportLevel: "english" as const, hintCount: 0 }
    ];
    const save = async (repository: IndexedDbProgressRepository, index: number) => {
      const item = events[index]!;
      const attemptId = `ordered-attempt-${index}`;
      await repository.saveExerciseResult({
        missionId: item.missionId, exerciseId: "e1", eventId: item.eventId,
        speakingSecondsDelta: 0,
        attemptEvent: {
          attemptId, phraseId: "help", missionId: item.missionId,
          ...(item.supportLevel === "prompt-only" ? { scenarioId: "help-scenario" } : {}),
          hintUsed: item.hintCount > 0, occurredAt: item.occurredAt
        },
        lessonState: {
          completedExerciseIds: ["e1"],
          phraseAttempts: { help: [{
            attemptId, supportLevel: item.supportLevel, passed: true,
            answerRevealed: false, hintCount: item.hintCount, timestamp: item.occurredAt,
            activity: "production"
          }] },
          phraseClasses: { help: item.supportLevel === "prompt-only" ? "recalled" : "practiced" }
        }
      });
    };
    for (const index of [0, 1, 2]) await save(chronological, index);
    await save(outOfOrder, 2);
    await save(outOfOrderSecondView, 1);
    await save(outOfOrder, 0);

    expect((await outOfOrder.load()).phraseReviews.help).toEqual(
      (await chronological.load()).phraseReviews.help
    );
    expect((await outOfOrder.load()).phraseReviews.help).toMatchObject({
      dueAt: "2026-09-10T10:00:00.000Z",
      masteredAt: "2026-09-03T10:00:00.000Z",
      successfulAttempts: 3,
      hintCount: 1,
      lastAttemptOccurredAt: "2026-09-03T10:00:00.000Z",
      lastScheduleEventId: "event-c"
    });
    expect((await outOfOrder.load()).hintCount).toBe(1);
  });

  test("uses event id as a deterministic schedule tie-breaker", async () => {
    const firstOrder = createRepository();
    const reverseOrder = createRepository();
    const occurredAt = "2026-09-05T10:00:00.000Z";
    const save = async (
      repository: IndexedDbProgressRepository,
      eventId: string,
      passed: boolean
    ) => {
      const missionId = `mission-${eventId}`;
      const attemptId = `attempt-${eventId}`;
      await repository.saveExerciseResult({
        missionId, exerciseId: "e1", eventId, speakingSecondsDelta: 0,
        attemptEvent: { attemptId, phraseId: "help", missionId, hintUsed: false, occurredAt },
        lessonState: {
          completedExerciseIds: ["e1"],
          phraseAttempts: { help: [{
            attemptId, supportLevel: "prompt-only", passed, answerRevealed: false,
            hintCount: 0, timestamp: occurredAt, activity: "production"
          }] },
          phraseClasses: { help: passed ? "recalled" : "introduced" }
        }
      });
    };
    await save(firstOrder, "event-a", true);
    await save(firstOrder, "event-z", false);
    await save(reverseOrder, "event-z", false);
    await save(reverseOrder, "event-a", true);

    expect((await reverseOrder.load()).phraseReviews.help).toEqual(
      (await firstOrder.load()).phraseReviews.help
    );
    expect((await reverseOrder.load()).phraseReviews.help).toMatchObject({
      dueAt: "2026-09-05T10:10:00.000Z",
      lastScheduleEventId: "event-z"
    });
  });

  test("projects legacy attempts across sessions once and uses them for mastery", async () => {
    const repository = createRepository();
    const legacy = createLearnerProgressV1(new Date("2026-08-30T00:00:00.000Z"));
    legacy.sessions["legacy-hotel"] = {
      missionId: "legacy-hotel", completedExerciseIds: ["old-1"],
      phraseAttempts: { help: [{
        supportLevel: "english", passed: true, answerRevealed: false,
        hintCount: 1, activity: "production"
      }] },
      phraseClasses: { help: "practiced" }
    };
    legacy.sessions["legacy-train"] = {
      missionId: "legacy-train", completedExerciseIds: ["old-2"],
      phraseAttempts: { help: [{
        supportLevel: "prompt-only", passed: true, answerRevealed: false,
        hintCount: 0, timestamp: "2026-08-31T10:00:00.000Z", activity: "production"
      }] },
      phraseClasses: { help: "recalled" }
    };
    legacy.hintCount = 1;
    const token = await repository.beginRestore(legacy);
    await repository.finalizeRestore(token, legacy);

    const migrated = await repository.load();
    expect(migrated.reviewProjectionVersion).toBe(1);
    expect(migrated.phraseReviews.help).toMatchObject({ successfulAttempts: 2, hintCount: 1 });

    const occurredAt = "2026-09-03T10:00:00.000Z";
    const event = {
      missionId: "new-help", exerciseId: "e1", eventId: "legacy-third", speakingSecondsDelta: 0,
      attemptEvent: {
        attemptId: "legacy-third-attempt", phraseId: "help", missionId: "new-help",
        hintUsed: false, occurredAt
      },
      lessonState: {
        completedExerciseIds: ["e1"],
        phraseAttempts: { help: [{
          attemptId: "legacy-third-attempt", supportLevel: "english" as const, passed: true,
          answerRevealed: false, hintCount: 0, timestamp: occurredAt,
          activity: "production" as const
        }] },
        phraseClasses: { help: "practiced" as const }
      }
    };
    await repository.saveExerciseResult(event);
    await repository.saveExerciseResult(event);

    const stored = await repository.load();
    expect(stored.phraseReviews.help).toMatchObject({
      successfulAttempts: 3,
      hintCount: 1,
      masteredAt: occurredAt,
      dueAt: "2026-09-10T10:00:00.000Z"
    });
    expect(stored.hintCount).toBe(1);
  });

  test("preserves unexplained legacy review totals while projecting known attempts", async () => {
    const repository = createRepository();
    const legacy = createLearnerProgressV1(new Date("2026-08-30T00:00:00.000Z"));
    legacy.sessions.legacy = {
      missionId: "legacy", completedExerciseIds: ["old"],
      phraseAttempts: { help: [{
        supportLevel: "english", passed: true, answerRevealed: false,
        hintCount: 1, activity: "production"
      }] },
      phraseClasses: { help: "practiced" }
    };
    legacy.phraseReviews.help = {
      dueAt: "2026-09-01T00:00:00.000Z", successfulAttempts: 7, hintCount: 4
    };
    legacy.hintCount = 9;
    const token = await repository.beginRestore(legacy);
    await repository.finalizeRestore(token, legacy);

    const migrated = await repository.load();
    expect(migrated.phraseReviews.help).toMatchObject({ successfulAttempts: 7, hintCount: 4 });
    expect(migrated.hintCount).toBe(9);
    await expect(repository.load()).resolves.toEqual(migrated);
  });

  test("reset clears progress and recordings while leaving the repository usable", async () => {
    const repository = createRepository();
    await repository.saveExerciseResult({ missionId: "hotel", exerciseId: "listen-1" });
    await repository.saveRecording("hotel/listen-1", new NodeBlob(["recording"]));
    const restoreTarget = { ...(await repository.load()), activeMissionId: "taxi" };
    const restoreToken = await repository.beginRestore(restoreTarget);

    await repository.reset();

    const progress = await repository.load();
    expect(progress.activeMissionId).toBeNull();
    expect(progress.sessions).toEqual({});
    await expect(repository.loadRecording("hotel/listen-1")).resolves.toBeUndefined();
    await expect(repository.rollbackRestore(restoreToken, restoreTarget)).resolves.toEqual({
      status: "checkpoint-mismatch"
    });

    await repository.saveExerciseResult({ missionId: "taxi", exerciseId: "roleplay-1" });
    await expect(repository.load()).resolves.toMatchObject({ activeMissionId: "taxi" });
  });

  test("keeps the first daily plan stable for a date", async () => {
    const repository = createRepository();
    const first = await repository.ensureDailyPlan("2026-09-05", ["hotel", "train", "restaurant"]);
    const second = await repository.ensureDailyPlan("2026-09-05", ["airport", "shopping", "emergency"]);

    expect(first.dailyPlans?.["2026-09-05"]?.missionIds).toEqual(["hotel", "train", "restaurant"]);
    expect(second.dailyPlans?.["2026-09-05"]?.missionIds).toEqual(["hotel", "train", "restaurant"]);
  });

  test("backfills stable daily steps without replacing a legacy mission plan", async () => {
    const repository = createRepository();
    await repository.ensureDailyPlan("2026-09-05", ["hotel", "train", "restaurant"]);
    const steps = [
      { kind: "mission" as const, missionId: "hotel", mode: "introduction" as const },
      { kind: "review" as const, slot: "morning" as const },
      { kind: "review" as const, slot: "midday" as const }
    ] as const;
    const backfilled = await repository.ensureDailyPlan(
      "2026-09-05", ["airport", "shopping", "emergency"], steps
    );
    const retried = await repository.ensureDailyPlan(
      "2026-09-05", ["other-1", "other-2", "other-3"], [
        { kind: "review", slot: "evening" },
        { kind: "review", slot: "morning" },
        { kind: "review", slot: "midday" }
      ]
    );
    expect(backfilled.dailyPlans?.["2026-09-05"]).toEqual({
      missionIds: ["hotel", "train", "restaurant"], steps: [...steps]
    });
    expect(retried.dailyPlans?.["2026-09-05"]).toEqual(backfilled.dailyPlans?.["2026-09-05"]);
  });

  test("advances mission introductions atomically and idempotently", async () => {
    const repository = createRepository();
    const orderedSentenceIds = ["hotel-learn-one", "hotel-learn-two"];
    const transition = {
      kind: "sentence" as const, missionId: "hotel", orderedSentenceIds,
      expectedIndex: 0, sentenceId: orderedSentenceIds[0]!, shadowed: true
    };
    const first = await repository.advanceMissionIntroduction(transition);
    const retried = await repository.advanceMissionIntroduction(transition);
    expect(first.missionIntroductions?.hotel).toEqual(retried.missionIntroductions?.hotel);
    expect(retried.missionIntroductions?.hotel).toMatchObject({
      nextSentenceIndex: 1, viewedSentenceIds: ["hotel-learn-one"],
      shadowedSentenceIds: ["hotel-learn-one"]
    });
    await expect(repository.advanceMissionIntroduction({
      ...transition, expectedIndex: 1, sentenceId: "hotel-learn-skipped"
    })).rejects.toThrow(/ordered sentence/i);
  });

  test("acknowledges recaps and completes only after every authored sentence", async () => {
    const repository = createRepository();
    const orderedSentenceIds = Array.from({ length: 5 }, (_, index) => `hotel-learn-${index}`);
    for (const [index, sentenceId] of orderedSentenceIds.entries()) {
      await repository.advanceMissionIntroduction({
        kind: "sentence", missionId: "hotel", orderedSentenceIds,
        expectedIndex: index, sentenceId, shadowed: false
      });
    }
    await repository.advanceMissionIntroduction({ kind: "recap", missionId: "hotel", atIndex: 5 });
    const completedAt = "2026-09-08T08:00:00.000Z";
    const completed = await repository.advanceMissionIntroduction({
      kind: "complete", missionId: "hotel", orderedSentenceIds, completedAt
    });
    expect(completed.missionIntroductions?.hotel).toMatchObject({
      nextSentenceIndex: 5, completedRecapIndexes: [5], completedAt
    });
  });
});
