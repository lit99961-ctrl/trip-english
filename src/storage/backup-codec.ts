import { z } from "zod";
import { learnerProgressV1Schema, type LearnerProgressV1 } from "../domain/progress";
import type { ProgressRepository } from "./progress-repository";

const BACKUP_FORMAT = "trip-english-backup" as const;
const BACKUP_VERSION = 1 as const;
const DEFAULT_COURSE_VERSION = "1";
export const MAX_BACKUP_BYTES = 1024 * 1024;
const cleanupHandleBrand = Symbol("restore-cleanup-handle");

const backupEnvelopeSchema = z
  .object({
    format: z.literal(BACKUP_FORMAT),
    backupVersion: z.literal(BACKUP_VERSION),
    exportedAt: z.string().datetime({ offset: true }),
    courseVersion: z.string().min(1),
    progress: learnerProgressV1Schema
  })
  .strict();

export interface BackupEncodeOptions {
  now?: () => Date;
  courseVersion?: string;
}

export interface BackupPreview {
  exportedAt: string;
  courseVersion: string;
  missionsWithProgress: Array<{
    missionId: string;
    completedExerciseIds: string[];
    completedExerciseCount: number;
  }>;
  missionCount: number;
  speakingMinutes: number;
}

interface PreparedBackupImport {
  progress: LearnerProgressV1;
  preview: BackupPreview;
}

export interface BackupDownload {
  blob: Blob;
  filename: string;
  text: string;
}

export type RestoreConfirmation =
  | boolean
  | ((preview: BackupPreview) => boolean | Promise<boolean>);

export interface RestoreCleanupHandle {
  readonly [cleanupHandleBrand]: true;
}

interface InternalRestoreCleanupHandle extends RestoreCleanupHandle {
  token: string;
  expectedProgress: LearnerProgressV1;
}

export type RestoreCleanupRetryResult =
  | { status: "finalized" }
  | { status: "checkpoint-mismatch" };

export type RestoreResult =
  | { restored: true; cleanupPending: false; progress: LearnerProgressV1 }
  | {
      restored: true;
      cleanupPending: true;
      progress: LearnerProgressV1;
      cleanupHandle: RestoreCleanupHandle;
    }
  | { restored: false; reason: "cancelled" | "superseded" };

export function encodeBackup(progress: LearnerProgressV1, options: BackupEncodeOptions = {}): string {
  const now = options.now ?? (() => new Date());
  const courseVersion = options.courseVersion ?? DEFAULT_COURSE_VERSION;
  const envelope = {
    format: BACKUP_FORMAT,
    backupVersion: BACKUP_VERSION,
    exportedAt: now().toISOString(),
    courseVersion,
    progress: validateProgress(progress)
  };

  try {
    return JSON.stringify(backupEnvelopeSchema.parse(envelope));
  } catch {
    throw unsupportedBackupError();
  }
}

export function decodeBackup(text: string): LearnerProgressV1 {
  return parseBackupEnvelope(text).progress;
}

export function inspectBackupImport(text: string): PreparedBackupImport {
  const envelope = parseBackupEnvelope(text);
  const missionsWithProgress = Object.values(envelope.progress.sessions)
    .filter((session) => session.completedExerciseIds.length > 0)
    .map((session) => ({
      missionId: session.missionId,
      completedExerciseIds: [...session.completedExerciseIds],
      completedExerciseCount: session.completedExerciseIds.length
    }));

  return {
    progress: envelope.progress,
    preview: {
      exportedAt: envelope.exportedAt,
      courseVersion: envelope.courseVersion,
      missionsWithProgress,
      missionCount: missionsWithProgress.length,
      speakingMinutes: Math.max(0, envelope.progress.speakingSeconds) / 60
    }
  };
}

export function createBackupDownload(
  progress: LearnerProgressV1,
  options: BackupEncodeOptions = {}
): BackupDownload {
  const text = encodeBackup(progress, options);
  const exportedAt = parseBackupEnvelope(text).exportedAt;
  const date = exportedAt.slice(0, 10);

  return {
    blob: new Blob([text], { type: "application/json" }),
    filename: `trip-english-backup-${date}.json`,
    text
  };
}

export async function readBackupText(file: Blob): Promise<string> {
  if (file.size > MAX_BACKUP_BYTES) {
    throw unsupportedBackupError();
  }
  return file.text();
}

export async function restoreBackup(
  repository: ProgressRepository,
  text: string,
  confirmation: RestoreConfirmation
): Promise<RestoreResult> {
  return restorePreparedBackup(repository, inspectBackupImport(text), confirmation);
}

export async function retryRestoreCleanup(
  repository: ProgressRepository,
  handle: RestoreCleanupHandle
): Promise<RestoreCleanupRetryResult> {
  const internalHandle = handle as InternalRestoreCleanupHandle;
  const finalized = await repository.finalizeRestore(
    internalHandle.token,
    internalHandle.expectedProgress
  );
  return finalized.status === "finalized"
    ? { status: "finalized" }
    : { status: "checkpoint-mismatch" };
}

async function restorePreparedBackup(
  repository: ProgressRepository,
  prepared: PreparedBackupImport,
  confirmation: RestoreConfirmation
): Promise<RestoreResult> {
  const progress = validateProgress(prepared.progress);
  const confirmed =
    typeof confirmation === "function" ? await confirmation(prepared.preview) : confirmation;

  if (!confirmed) {
    return { restored: false, reason: "cancelled" };
  }

  let token: string | undefined;
  try {
    token = await repository.beginRestore(progress);
    const reloadedProgress = validateProgress(await repository.load());
    if (!progressesEqual(reloadedProgress, progress)) {
      throw new Error("restored progress did not match the requested backup");
    }
  } catch (error) {
    if (token) {
      try {
        await repository.rollbackRestore(token, progress);
      } catch (rollbackError) {
        throw new Error("restore failed and rollback failed", {
          cause: { restoreError: error, rollbackError }
        });
      }
    }
    throw error;
  }

  try {
    const finalized = await repository.finalizeRestore(token, progress);
    if (finalized.status === "finalized") {
      return { restored: true, cleanupPending: false, progress };
    }
    return { restored: false, reason: "superseded" };
  } catch {
    // The restored state has already re-opened successfully; retain its checkpoint for later cleanup.
    return {
      restored: true,
      cleanupPending: true,
      progress,
      cleanupHandle: createCleanupHandle(token, progress)
    };
  }
}

function parseBackupEnvelope(text: string) {
  try {
    return backupEnvelopeSchema.parse(JSON.parse(text));
  } catch {
    throw unsupportedBackupError();
  }
}

function validateProgress(progress: unknown): LearnerProgressV1 {
  try {
    return learnerProgressV1Schema.parse(progress);
  } catch {
    throw unsupportedBackupError();
  }
}

function unsupportedBackupError(): Error {
  return new Error("unsupported backup: this file is invalid or from an incompatible version");
}

function createCleanupHandle(
  token: string,
  expectedProgress: LearnerProgressV1
): RestoreCleanupHandle {
  const handle: InternalRestoreCleanupHandle = {
    [cleanupHandleBrand]: true,
    token,
    expectedProgress
  };
  return handle;
}

function progressesEqual(left: LearnerProgressV1, right: LearnerProgressV1): boolean {
  return stableJson(left) === stableJson(right);
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
