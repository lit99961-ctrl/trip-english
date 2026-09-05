export type Confidence = 1 | 2 | 3;
export type ReviewOutcome = "failed" | "supported" | "prompt-free" | "mastered";

export interface ReviewRequest {
  outcome: ReviewOutcome;
  /** 1 is low confidence, 2 is medium, and 3 is high confidence. */
  confidence: Confidence;
  hintCount: number;
  now: Date;
}

export interface ReviewSchedule {
  dueAt: string;
  intervalMinutes: number;
  reason: string;
}

const TEN_MINUTES = 10;
const ONE_DAY = 24 * 60;
const THREE_DAYS = 3 * ONE_DAY;
const SEVEN_DAYS = 7 * ONE_DAY;

function assertValidRequest(request: ReviewRequest): void {
  if (!Number.isInteger(request.confidence) || request.confidence < 1 || request.confidence > 3) {
    throw new Error("confidence must be 1, 2, or 3");
  }
  if (!Number.isInteger(request.hintCount) || request.hintCount < 0) {
    throw new Error("hintCount must be a non-negative integer");
  }
  if (Number.isNaN(request.now.getTime())) {
    throw new Error("now must be a valid Date");
  }
}

function shortenedReason(base: string, lowConfidence: boolean, extraSupport: boolean): string {
  if (lowConfidence && extraSupport) {
    return `${base} with low confidence and extra support`;
  }
  if (lowConfidence) {
    return `${base} with low confidence`;
  }
  return `${base} with extra support`;
}

/**
 * Schedules the next retrieval opportunity with UTC millisecond arithmetic.
 * Low confidence is confidence 1; two or more hints have the same effect.
 */
export function scheduleReview(request: ReviewRequest): ReviewSchedule {
  assertValidRequest(request);

  const lowConfidence = request.confidence === 1;
  const extraSupport = request.hintCount >= 2;
  const shorten = lowConfidence || extraSupport;
  let intervalMinutes: number;
  let reason: string;

  switch (request.outcome) {
    case "failed":
      intervalMinutes = TEN_MINUTES;
      reason = "same-session retry";
      break;
    case "supported":
      intervalMinutes = shorten ? TEN_MINUTES : ONE_DAY;
      reason = shorten
        ? shortenedReason("supported success", lowConfidence, extraSupport)
        : "supported success";
      break;
    case "prompt-free":
      intervalMinutes = shorten ? ONE_DAY : THREE_DAYS;
      reason = shorten
        ? shortenedReason("prompt-free recall", lowConfidence, extraSupport)
        : "prompt-free recall";
      break;
    case "mastered":
      intervalMinutes = shorten ? THREE_DAYS : SEVEN_DAYS;
      reason = shorten
        ? shortenedReason("mastered recall", lowConfidence, extraSupport)
        : "mastered recall";
      break;
    default: {
      const impossible: never = request.outcome;
      throw new Error(`Unknown review outcome: ${impossible}`);
    }
  }

  return {
    dueAt: new Date(request.now.getTime() + intervalMinutes * 60_000).toISOString(),
    intervalMinutes,
    reason
  };
}
