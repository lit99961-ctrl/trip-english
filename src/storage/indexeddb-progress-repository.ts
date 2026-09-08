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
import { scheduleReview, type ReviewOutcome } from "../domain/review-scheduler";
import type {
  LearningAttemptEvent,
  AdvanceMissionIntroductionInput,
  ProgressRepository,
  RestoreFinalizeOutcome,
  RestoreRollbackOutcome,
  RestoreToken,
  SaveCalibrationResultInput,
  SaveExerciseResultInput,
  SaveLookupInput
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
    const transaction = database.transaction(["progress", "restore-checkpoints"], "readwrite");
    const storedProgress = await transaction.objectStore("progress").get(PROGRESS_KEY);
    const checkpoint = await transaction.objectStore("restore-checkpoints").get(RESTORE_CHECKPOINT_KEY);
    const migratedProgress = migrateProgress(storedProgress, this.now());

    // Restore verification must observe the exact candidate snapshot. Projecting
    // it here would mutate the CAS target before finalize or rollback can compare it.
    if (checkpoint) {
      await transaction.done;
      return migratedProgress;
    }
    const progress = projectReviewHistory(migratedProgress);

    if (storedProgress === undefined || stableJson(storedProgress) !== stableJson(progress)) {
      await transaction.objectStore("progress").put(progress, PROGRESS_KEY);
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
    if (input.attemptEvent !== undefined && !isEventWrite) {
      throw new Error("attemptEvent requires an exactly-once exercise event");
    }
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
    const progress = projectReviewHistory(migrateProgress(storedProgress, this.now()));
    const session = progress.sessions[input.missionId] ?? {
      missionId: input.missionId,
      completedExerciseIds: []
    };
    const normalizedEventPayload = isEventWrite
      ? stableJson({
        exerciseId: input.exerciseId,
        completedExerciseIds: input.lessonState!.completedExerciseIds,
        phraseAttempts: input.lessonState!.phraseAttempts,
        speakingSecondsDelta: input.speakingSecondsDelta,
        ...(input.attemptEvent === undefined ? {} : { attemptEvent: input.attemptEvent })
      })
      : undefined;
    const storedEventPayload = input.eventId
      ? session.exerciseEvents?.[input.eventId]
      : undefined;
    const eventInOtherSession = input.eventId
      ? Object.entries(progress.sessions).find(([storedMissionId, storedSession]) =>
        storedMissionId !== input.missionId
        && storedSession.exerciseEvents?.[input.eventId!] !== undefined
      )
      : undefined;
    if (eventInOtherSession) {
      throw new Error(`exercise event id collision across missions: ${input.eventId}`);
    }
    if (storedEventPayload !== undefined) {
      if (storedEventPayload !== normalizedEventPayload) {
        throw new Error(`exercise event id collision: ${input.eventId}`);
      }
      if (stableJson(storedProgress) !== stableJson(progress)) {
        await transaction.store.put(progress, PROGRESS_KEY);
      }
      await transaction.done;
      return progress;
    }
    if (input.attemptEvent && attemptEventWasProcessed(progress, input.attemptEvent.attemptId)) {
      throw new Error(`attempt event was already processed: ${input.attemptEvent.attemptId}`);
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
    const phraseClasses = phraseAttempts === undefined
      ? session.phraseClasses
      : derivePhraseClasses(phraseAttempts);
    const reviewUpdate = input.attemptEvent === undefined
      ? undefined
      : reviewForAttempt(
        input.attemptEvent,
        input.eventId!,
        input.missionId,
        phraseAttempts ?? {},
        progress
      );
    const previousReview = reviewUpdate
      ? progress.phraseReviews[reviewUpdate.phraseId]
      : undefined;
    const phraseReviews = reviewUpdate === undefined
      ? progress.phraseReviews
      : {
        ...progress.phraseReviews,
        [reviewUpdate.phraseId]: {
          dueAt: reviewUpdate.dueAt,
          successfulAttempts:
            (previousReview?.projectionBaseSuccessfulAttempts ?? 0)
            + reviewUpdate.derivedSuccessfulAttempts,
          hintCount:
            (previousReview?.projectionBaseHintCount ?? 0)
            + reviewUpdate.derivedHintCount,
          ...((previousReview?.masteredAt ?? reviewUpdate.masteredAt) === undefined ? {} : {
            masteredAt: earliestTimestamp(previousReview?.masteredAt, reviewUpdate.masteredAt)
          }),
          lastAttemptOccurredAt: reviewUpdate.lastAttemptOccurredAt,
          lastScheduleEventId: reviewUpdate.lastScheduleEventId,
          projectionBaseSuccessfulAttempts:
            previousReview?.projectionBaseSuccessfulAttempts ?? 0,
          projectionBaseHintCount: previousReview?.projectionBaseHintCount ?? 0,
          ...(previousReview?.projectionLegacyDueAt === undefined ? {} : {
            projectionLegacyDueAt: previousReview.projectionLegacyDueAt
          })
        }
      };
    const promptFreeScenarioIds = reviewUpdate?.scenarioId === undefined
      ? progress.promptFreeScenarioIds
      : [...new Set([...progress.promptFreeScenarioIds, reviewUpdate.scenarioId])];
    const nextProgress: LearnerProgressV1 = {
      ...progress,
      activeMissionId: input.missionId,
      phraseReviews,
      hintCount: progress.hintCount + (reviewUpdate?.currentHintCount ?? 0),
      promptFreeScenarioIds,
      ...(reviewUpdate === undefined ? {} : {
        reviewProjectionVersion: 1 as const,
        reviewProjectionHintBase: progress.reviewProjectionHintBase ?? progress.hintCount
      }),
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
            phraseClasses
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
    const progress = projectReviewHistory(migrateProgress(storedProgress, this.now()));
    const nextProgress = migrateProgress({ ...progress, calibration: input }, this.now());
    await transaction.store.put(nextProgress, PROGRESS_KEY);
    await transaction.done;
    return nextProgress;
  }

  public async savePhraseId(phraseId: string): Promise<LearnerProgressV1> {
    const normalized = phraseId.trim();
    if (!normalized || normalized !== phraseId) throw new Error("phraseId must be trimmed and nonempty");
    const database = await this.getDatabase();
    const transaction = database.transaction("progress", "readwrite");
    const progress = projectReviewHistory(migrateProgress(await transaction.store.get(PROGRESS_KEY), this.now()));
    const next = migrateProgress({
      ...progress,
      savedPhraseIds: [...new Set([...progress.savedPhraseIds, normalized])]
    }, this.now());
    await transaction.store.put(next, PROGRESS_KEY);
    await transaction.done;
    return next;
  }

  public async saveLookup(input: SaveLookupInput): Promise<LearnerProgressV1> {
    const text = input.text.normalize("NFKC").trim().replace(/\s+/g, " ");
    const savedAt = new Date(input.savedAt);
    if (!text || text.length > 500 || Number.isNaN(savedAt.getTime()) || savedAt.toISOString() !== input.savedAt) {
      throw new Error("lookup input is invalid");
    }
    const knownWords = [...new Set(input.knownWords.map((word) => word.toLocaleLowerCase("en-US").trim()))].sort();
    if (knownWords.some((word) => !/^[a-z]+(?:'[a-z]+)?$/.test(word))) {
      throw new Error("known words must be normalized English words");
    }
    const database = await this.getDatabase();
    const transaction = database.transaction("progress", "readwrite");
    const progress = projectReviewHistory(migrateProgress(await transaction.store.get(PROGRESS_KEY), this.now()));
    const history = [...(progress.lookupHistory ?? []), { text, knownWords, savedAt: input.savedAt }].slice(-50);
    const next = migrateProgress({
      ...progress,
      knownWords: [...new Set([...(progress.knownWords ?? []), ...knownWords])].sort(),
      lookupHistory: history
    }, this.now());
    await transaction.store.put(next, PROGRESS_KEY);
    await transaction.done;
    return next;
  }

  public async ensureDailyPlan(
    date: string,
    missionIds: readonly [string, string, string]
  ): Promise<LearnerProgressV1> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || new Set(missionIds).size !== 3 || missionIds.some((id) => !id.trim())) {
      throw new Error("daily plan input is invalid");
    }
    const database = await this.getDatabase();
    const transaction = database.transaction("progress", "readwrite");
    const progress = projectReviewHistory(migrateProgress(await transaction.store.get(PROGRESS_KEY), this.now()));
    if (progress.dailyPlans?.[date]) {
      await transaction.done;
      return progress;
    }
    const retained = Object.fromEntries(Object.entries(progress.dailyPlans ?? {})
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, 30));
    const next = migrateProgress({
      ...progress,
      dailyPlans: { ...retained, [date]: { missionIds: [...missionIds] } }
    }, this.now());
    await transaction.store.put(next, PROGRESS_KEY);
    await transaction.done;
    return next;
  }

  public async advanceMissionIntroduction(
    input: AdvanceMissionIntroductionInput
  ): Promise<LearnerProgressV1> {
    const missionId = input.missionId.trim();
    if (!missionId || missionId !== input.missionId) throw new Error("missionId must be trimmed and nonempty");
    if (input.kind === "sentence") {
      if (
        !Number.isInteger(input.expectedIndex)
        || input.expectedIndex < 0
        || new Set(input.orderedSentenceIds).size !== input.orderedSentenceIds.length
        || input.orderedSentenceIds.some((id) => !id.startsWith(`${missionId}-`))
        || input.orderedSentenceIds[input.expectedIndex] !== input.sentenceId
      ) throw new Error("sentence transition must reference the ordered sentence at expectedIndex");
    }
    if (input.kind === "complete") {
      const timestamp = new Date(input.completedAt);
      if (
        Number.isNaN(timestamp.getTime())
        || timestamp.toISOString() !== input.completedAt
        || new Set(input.orderedSentenceIds).size !== input.orderedSentenceIds.length
        || input.orderedSentenceIds.some((id) => !id.startsWith(`${missionId}-`))
      ) throw new Error("introduction completion input is invalid");
    }

    const database = await this.getDatabase();
    const transaction = database.transaction("progress", "readwrite");
    const progress = projectReviewHistory(migrateProgress(await transaction.store.get(PROGRESS_KEY), this.now()));
    const current = progress.missionIntroductions?.[missionId] ?? {
      missionId,
      nextSentenceIndex: 0,
      viewedSentenceIds: [],
      shadowedSentenceIds: [],
      completedRecapIndexes: []
    };
    let introduction = current;

    if (input.kind === "sentence") {
      if (current.nextSentenceIndex === input.expectedIndex + 1
        && current.viewedSentenceIds[input.expectedIndex] === input.sentenceId) {
        introduction = input.shadowed && !current.shadowedSentenceIds.includes(input.sentenceId)
          ? { ...current, shadowedSentenceIds: [...current.shadowedSentenceIds, input.sentenceId] }
          : current;
      } else {
        if (current.nextSentenceIndex !== input.expectedIndex) throw new Error("stale introduction cursor");
        introduction = {
          ...current,
          nextSentenceIndex: input.expectedIndex + 1,
          viewedSentenceIds: [...current.viewedSentenceIds, input.sentenceId],
          shadowedSentenceIds: input.shadowed
            ? [...current.shadowedSentenceIds, input.sentenceId]
            : current.shadowedSentenceIds
        };
      }
    } else if (input.kind === "recap") {
      if (current.nextSentenceIndex < input.atIndex) throw new Error("recap cannot precede its sentence checkpoint");
      introduction = current.completedRecapIndexes.includes(input.atIndex)
        ? current
        : { ...current, completedRecapIndexes: [...current.completedRecapIndexes, input.atIndex] };
    } else {
      if (
        current.nextSentenceIndex !== input.orderedSentenceIds.length
        || current.viewedSentenceIds.length !== input.orderedSentenceIds.length
        || current.viewedSentenceIds.some((id, index) => id !== input.orderedSentenceIds[index])
      ) throw new Error("all authored sentences must be viewed before completion");
      introduction = current.completedAt ? current : { ...current, completedAt: input.completedAt };
    }

    const next = migrateProgress({
      ...progress,
      missionIntroductions: {
        ...(progress.missionIntroductions ?? {}),
        [missionId]: introduction
      }
    }, this.now());
    await transaction.store.put(next, PROGRESS_KEY);
    await transaction.done;
    return next;
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

    const projectedProgress = migrateProgress(
      projectReviewHistory(migrateProgress(currentProgress, this.now())),
      this.now()
    );
    await transaction.objectStore("progress").put(projectedProgress, PROGRESS_KEY);
    await transaction.objectStore("restore-checkpoints").delete(RESTORE_CHECKPOINT_KEY);
    await transaction.done;
    return { status: "finalized", progress: projectedProgress };
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

function attemptEventWasProcessed(progress: LearnerProgressV1, attemptId: string): boolean {
  return Object.values(progress.sessions).some((session) =>
    Object.values(session.exerciseEvents ?? {}).some((payload) => {
      try {
        const parsed = JSON.parse(payload) as { attemptEvent?: { attemptId?: unknown } };
        return parsed.attemptEvent?.attemptId === attemptId;
      } catch {
        return false;
      }
    })
  );
}

function reviewForAttempt(
  event: LearningAttemptEvent,
  eventId: string,
  missionId: string,
  attemptsByPhrase: Record<string, Attempt[]>,
  progress: LearnerProgressV1
): {
  phraseId: string;
  dueAt: string;
  derivedSuccessfulAttempts: number;
  derivedHintCount: number;
  currentHintCount: number;
  masteredAt?: string;
  scenarioId?: string;
  lastAttemptOccurredAt: string;
  lastScheduleEventId: string;
} {
  if (event.missionId !== missionId) throw new Error("attempt event mission does not match exercise event");
  const occurredAt = new Date(event.occurredAt);
  if (Number.isNaN(occurredAt.getTime()) || occurredAt.toISOString() !== event.occurredAt) {
    throw new Error("attempt event occurredAt must be an ISO timestamp");
  }
  const attempt = attemptsByPhrase[event.phraseId]?.find((item) => item.attemptId === event.attemptId);
  if (!attempt) throw new Error("attempt event must reference a persisted attempt");
  if (attempt.timestamp !== event.occurredAt) throw new Error("attempt event timestamp does not match attempt");
  const hintCount = attempt.hintCount ?? 0;
  if (event.hintUsed !== (hintCount > 0)) throw new Error("attempt event hint usage does not match attempt");

  const records = learningEventsForPhrase(progress, event.phraseId);
  records.push({ eventId, event, attempt, historyPrefix: false });
  records.sort(compareLearningEvents);
  const projection = projectLearningRecords(records);
  const promptFreePass = isPromptFreePass(attempt);
  return {
    phraseId: event.phraseId,
    dueAt: projection.dueAt,
    derivedSuccessfulAttempts: projection.successfulAttempts,
    derivedHintCount: projection.hintCount,
    currentHintCount: hintCount,
    ...(projection.masteredAt === undefined ? {} : { masteredAt: projection.masteredAt }),
    ...(promptFreePass && event.scenarioId ? { scenarioId: event.scenarioId } : {}),
    lastAttemptOccurredAt: projection.lastAttemptOccurredAt,
    lastScheduleEventId: projection.lastScheduleEventId
  };
}

interface LearningEventRecord {
  eventId: string;
  event: LearningAttemptEvent;
  attempt: Attempt;
  historyPrefix: boolean;
}

function learningEventsForPhrase(
  progress: LearnerProgressV1,
  phraseId: string
): LearningEventRecord[] {
  const records: LearningEventRecord[] = [];
  for (const session of Object.values(progress.sessions)) {
    for (const [eventId, payload] of Object.entries(session.exerciseEvents ?? {})) {
      try {
        const parsed = JSON.parse(payload) as {
          attemptEvent?: LearningAttemptEvent;
          phraseAttempts?: Record<string, Attempt[]>;
        };
        const event = parsed.attemptEvent;
        if (!event || event.phraseId !== phraseId) continue;
        const attempt = parsed.phraseAttempts?.[phraseId]
          ?.find((item) => item.attemptId === event.attemptId);
        const occurredAt = new Date(event.occurredAt);
        if (
          attempt
          && !Number.isNaN(occurredAt.getTime())
          && occurredAt.toISOString() === event.occurredAt
          && attempt.timestamp === event.occurredAt
          && event.hintUsed === ((attempt.hintCount ?? 0) > 0)
        ) {
          records.push({ eventId, event, attempt, historyPrefix: false });
        }
      } catch {
        // Older event payloads may not contain structured attempt metadata.
      }
    }
  }
  const representedAttemptIds = new Set(records.map((record) => record.attempt.attemptId));
  const fallbackOccurredAt = new Date(new Date(progress.startedAt).getTime() - 1).toISOString();
  for (const [sessionId, session] of Object.entries(progress.sessions).sort(([left], [right]) =>
    left < right ? -1 : left > right ? 1 : 0
  )) {
    for (const [index, legacyAttempt] of (session.phraseAttempts?.[phraseId] ?? []).entries()) {
      if (legacyAttempt.attemptId && representedAttemptIds.has(legacyAttempt.attemptId)) continue;
      const stableIdentity = stableJson({ sessionId, phraseId, index, legacyAttempt });
      const attemptId = legacyAttempt.attemptId ?? `legacy-attempt-${stableHash(stableIdentity)}`;
      const occurredAt = isCanonicalTimestamp(legacyAttempt.timestamp)
        ? legacyAttempt.timestamp
        : fallbackOccurredAt;
      const attempt = { ...legacyAttempt, attemptId, timestamp: occurredAt };
      records.push({
        eventId: `legacy-event-${stableHash(stableIdentity)}`,
        event: {
          attemptId,
          phraseId,
          missionId: session.missionId,
          hintUsed: (attempt.hintCount ?? 0) > 0,
          occurredAt
        },
        attempt,
        historyPrefix: true
      });
      representedAttemptIds.add(attemptId);
    }
  }
  return records;
}

function compareLearningEvents(left: LearningEventRecord, right: LearningEventRecord): number {
  if (left.historyPrefix !== right.historyPrefix) return left.historyPrefix ? -1 : 1;
  if (left.event.occurredAt < right.event.occurredAt) return -1;
  if (left.event.occurredAt > right.event.occurredAt) return 1;
  if (left.eventId < right.eventId) return -1;
  if (left.eventId > right.eventId) return 1;
  return 0;
}

function projectLearningRecords(records: LearningEventRecord[]): {
  dueAt: string;
  successfulAttempts: number;
  hintCount: number;
  masteredAt?: string;
  lastAttemptOccurredAt: string;
  lastScheduleEventId: string;
} {
  records.sort(compareLearningEvents);
  const firstMasteryIndex = records.findIndex((_, index) =>
    canMaster(records.slice(0, index + 1).map((record) => record.attempt))
  );
  const latest = records.at(-1)!;
  const latestIndex = records.length - 1;
  const outcome = reviewOutcome(latest.attempt, latestIndex === firstMasteryIndex);
  const schedule = scheduleReview({
    outcome,
    confidence: !latest.attempt.passed
      ? 1
      : isPromptFreePass(latest.attempt) || latestIndex === firstMasteryIndex ? 3 : 2,
    hintCount: latest.attempt.hintCount ?? 0,
    now: new Date(latest.event.occurredAt)
  });
  return {
    dueAt: schedule.dueAt,
    successfulAttempts: records.filter(({ attempt }) =>
      attempt.passed && attempt.activity !== "choice"
    ).length,
    hintCount: records.reduce((total, { attempt }) => total + (attempt.hintCount ?? 0), 0),
    ...(firstMasteryIndex < 0 ? {} : { masteredAt: records[firstMasteryIndex]!.event.occurredAt }),
    lastAttemptOccurredAt: latest.event.occurredAt,
    lastScheduleEventId: latest.eventId
  };
}

function projectReviewHistory(progress: LearnerProgressV1): LearnerProgressV1 {
  const phraseIds = new Set(Object.keys(progress.phraseReviews));
  for (const session of Object.values(progress.sessions)) {
    Object.keys(session.phraseAttempts ?? {}).forEach((phraseId) => phraseIds.add(phraseId));
  }
  if (phraseIds.size === 0 && progress.reviewProjectionVersion === undefined) return progress;
  const phraseReviews = { ...progress.phraseReviews };
  let derivedGlobalHintCount = 0;
  for (const phraseId of phraseIds) {
    const records = learningEventsForPhrase(progress, phraseId);
    const existing = progress.phraseReviews[phraseId];
    if (records.length === 0) {
      if (existing) {
        phraseReviews[phraseId] = {
          ...existing,
          projectionBaseSuccessfulAttempts:
            existing.projectionBaseSuccessfulAttempts ?? existing.successfulAttempts,
          projectionBaseHintCount: existing.projectionBaseHintCount ?? existing.hintCount
        };
      }
      continue;
    }
    const projection = projectLearningRecords(records);
    derivedGlobalHintCount += projection.hintCount;
    const baseSuccessfulAttempts = existing?.projectionBaseSuccessfulAttempts
      ?? Math.max(0, (existing?.successfulAttempts ?? 0) - projection.successfulAttempts);
    const baseHintCount = existing?.projectionBaseHintCount
      ?? Math.max(0, (existing?.hintCount ?? 0) - projection.hintCount);
    const preserveLegacyDue = progress.reviewProjectionVersion === undefined
      && existing !== undefined
      && existing.lastScheduleEventId === undefined;
    const projectionLegacyDueAt = existing?.projectionLegacyDueAt
      ?? (preserveLegacyDue ? existing?.dueAt : undefined);
    const hasStructuredEvent = records.some((record) => !record.historyPrefix);
    phraseReviews[phraseId] = {
      dueAt: !hasStructuredEvent && projectionLegacyDueAt
        ? projectionLegacyDueAt
        : projection.dueAt,
      successfulAttempts: baseSuccessfulAttempts + projection.successfulAttempts,
      hintCount: baseHintCount + projection.hintCount,
      ...((existing?.masteredAt ?? projection.masteredAt) === undefined ? {} : {
        masteredAt: earliestTimestamp(existing?.masteredAt, projection.masteredAt)
      }),
      lastAttemptOccurredAt: projection.lastAttemptOccurredAt,
      lastScheduleEventId: projection.lastScheduleEventId,
      projectionBaseSuccessfulAttempts: baseSuccessfulAttempts,
      projectionBaseHintCount: baseHintCount,
      ...(projectionLegacyDueAt === undefined ? {} : { projectionLegacyDueAt })
    };
  }
  const reviewProjectionHintBase = progress.reviewProjectionHintBase
    ?? Math.max(0, progress.hintCount - derivedGlobalHintCount);
  return {
    ...progress,
    phraseReviews,
    hintCount: reviewProjectionHintBase + derivedGlobalHintCount,
    reviewProjectionVersion: 1,
    reviewProjectionHintBase
  };
}

function isCanonicalTimestamp(value: string | undefined): value is string {
  if (!value) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}

function stableHash(value: string): string {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(36);
}

function isPromptFreePass(attempt: Attempt): boolean {
  return attempt.passed
    && attempt.activity !== "choice"
    && attempt.supportLevel === "prompt-only"
    && !attempt.answerRevealed;
}

function reviewOutcome(attempt: Attempt, firstMastery: boolean): ReviewOutcome {
  if (!attempt.passed) return "failed";
  if (firstMastery) return "mastered";
  return isPromptFreePass(attempt) ? "prompt-free" : "supported";
}

function earliestTimestamp(
  left: string | undefined,
  right: string | undefined
): string | undefined {
  if (left === undefined) return right;
  if (right === undefined) return left;
  return left < right ? left : right;
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
