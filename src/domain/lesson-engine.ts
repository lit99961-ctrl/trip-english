export type SupportLevel = "full" | "english" | "partial" | "prompt-only";
export type AttemptClass = "introduced" | "practiced" | "recalled" | "mastered";
export type AttemptActivity = "production" | "choice";

/** A normalized, production-relevant learner attempt. */
export interface Attempt {
  supportLevel: SupportLevel;
  passed: boolean;
  answerRevealed: boolean;
  hintCount?: number;
  timestamp?: string;
  activity?: AttemptActivity;
}

export interface AttemptInput {
  supportLevel?: SupportLevel;
  passed: boolean;
  answerRevealed: boolean;
  hintCount?: number;
  timestamp?: string;
  activity?: AttemptActivity;
  /** Prior attempts for this phrase; the current attempt is appended internally. */
  history?: readonly Attempt[];
}

export interface LessonDefinition {
  exerciseIds: readonly string[];
  phraseIds: readonly string[];
}

export interface LessonState {
  completedExerciseIds: string[];
  phraseAttempts: Record<string, Attempt[]>;
  phraseClasses: Record<string, AttemptClass>;
}

function assertHintCount(hintCount: number | undefined): void {
  if (hintCount !== undefined && (!Number.isInteger(hintCount) || hintCount < 0)) {
    throw new Error("hintCount must be a non-negative integer");
  }
}

function normalizeAttempt(input: AttemptInput): Attempt {
  assertHintCount(input.hintCount);
  const hintCount = input.hintCount ?? 0;
  return {
    supportLevel: input.supportLevel ?? (input.answerRevealed ? "full" : hintCount > 0 ? "partial" : "prompt-only"),
    passed: input.passed,
    answerRevealed: input.answerRevealed,
    ...(input.hintCount === undefined ? {} : { hintCount: input.hintCount }),
    ...(input.timestamp === undefined ? {} : { timestamp: input.timestamp }),
    ...(input.activity === undefined ? {} : { activity: input.activity })
  };
}

function isProductionPass(attempt: Attempt): boolean {
  return attempt.passed && attempt.activity !== "choice";
}

function isPromptFreePass(attempt: Attempt): boolean {
  return isProductionPass(attempt) && attempt.supportLevel === "prompt-only" && !attempt.answerRevealed;
}

/** A phrase is mastered only after three passed production attempts and a prompt-free recall. */
export function canMaster(history: readonly Attempt[]): boolean {
  const passedAttempts = history.filter(isProductionPass);
  return passedAttempts.length >= 3 && passedAttempts.some(isPromptFreePass);
}

/**
 * Classifies the current attempt. Missing support defaults to prompt-only only
 * when no answer was revealed and no hint was used, keeping the common input
 * `{ passed, answerRevealed, hintCount }` valid without disguising support.
 */
export function classifyAttempt(input: AttemptInput): AttemptClass {
  const attempt = normalizeAttempt(input);
  const isSupported = attempt.answerRevealed
    || (attempt.hintCount ?? 0) > 0
    || attempt.supportLevel !== "prompt-only"
    || attempt.activity === "choice";

  if (!attempt.passed) {
    return isSupported ? "practiced" : "introduced";
  }
  if (isSupported) {
    return "practiced";
  }

  return canMaster([...(input.history ?? []), attempt]) ? "mastered" : "recalled";
}

export function createLessonState(): LessonState {
  return { completedExerciseIds: [], phraseAttempts: {}, phraseClasses: {} };
}

function assertKnownId(ids: readonly string[], id: string, label: string): void {
  if (!ids.includes(id)) {
    throw new Error(`Unknown ${label}: ${id}`);
  }
}

function assertStateMatchesLesson(definition: LessonDefinition, state: LessonState): void {
  for (const exerciseId of state.completedExerciseIds) {
    assertKnownId(definition.exerciseIds, exerciseId, "exercise");
  }
  for (const phraseId of Object.keys(state.phraseAttempts)) {
    assertKnownId(definition.phraseIds, phraseId, "phrase");
  }
}

/** Returns the first authored exercise that has not already been completed. */
export function nextExercise(definition: LessonDefinition, state: LessonState): string | undefined {
  assertStateMatchesLesson(definition, state);
  return definition.exerciseIds.find((exerciseId) => !state.completedExerciseIds.includes(exerciseId));
}

/** Records one exercise completion, preserving existing state for duplicate calls. */
export function completeExercise(definition: LessonDefinition, state: LessonState, exerciseId: string): LessonState {
  assertStateMatchesLesson(definition, state);
  assertKnownId(definition.exerciseIds, exerciseId, "exercise");
  if (state.completedExerciseIds.includes(exerciseId)) {
    return state;
  }
  return { ...state, completedExerciseIds: [...state.completedExerciseIds, exerciseId] };
}

/** Appends an attempt and derives its phrase class from the complete phrase history. */
export function recordPhraseAttempt(
  definition: LessonDefinition,
  state: LessonState,
  phraseId: string,
  input: AttemptInput
): LessonState {
  assertStateMatchesLesson(definition, state);
  assertKnownId(definition.phraseIds, phraseId, "phrase");
  const previous = state.phraseAttempts[phraseId] ?? [];
  const attempt = normalizeAttempt(input);
  const phraseClass = classifyAttempt({ ...attempt, history: previous });
  const attempts = [...previous, attempt];

  return {
    ...state,
    phraseAttempts: { ...state.phraseAttempts, [phraseId]: attempts },
    phraseClasses: { ...state.phraseClasses, [phraseId]: phraseClass }
  };
}
