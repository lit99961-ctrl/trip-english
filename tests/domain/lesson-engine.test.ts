import { describe, expect, it } from "vitest";
import {
  canMaster,
  classifyAttempt,
  completeExercise,
  createLessonState,
  nextExercise,
  recordPhraseAttempt,
  type Attempt,
  type LessonDefinition
} from "../../src/domain/lesson-engine";

const promptFreePass = (): Attempt => ({
  supportLevel: "prompt-only",
  passed: true,
  answerRevealed: false
});

describe("mastery classification", () => {
  it("classifies an answer-revealed hinted success as practiced", () => {
    expect(classifyAttempt({ passed: true, answerRevealed: true, hintCount: 1 })).toBe("practiced");
  });

  it("classifies an unseen failed prompt-only attempt as introduced", () => {
    expect(classifyAttempt({ passed: false, answerRevealed: false, supportLevel: "prompt-only" }))
      .toBe("introduced");
  });

  it("classifies supported or hinted successes as practiced", () => {
    expect(classifyAttempt({ passed: true, answerRevealed: false, supportLevel: "english" }))
      .toBe("practiced");
    expect(classifyAttempt({ passed: true, answerRevealed: false, hintCount: 1 }))
      .toBe("practiced");
  });

  it("classifies an independent prompt-only pass as recalled", () => {
    expect(classifyAttempt({ passed: true, answerRevealed: false, supportLevel: "prompt-only" }))
      .toBe("recalled");
  });

  it("requires exactly three passed production attempts including one prompt-free recall", () => {
    const history: Attempt[] = [
      { supportLevel: "full", passed: true, answerRevealed: true },
      { supportLevel: "english", passed: true, answerRevealed: false },
      promptFreePass()
    ];

    expect(canMaster(history.slice(0, 2))).toBe(false);
    expect(canMaster(history)).toBe(true);
    expect(classifyAttempt({ ...promptFreePass(), history: history.slice(0, 2) })).toBe("mastered");
  });

  it("does not let answer reveals, choice-only activity, or failures satisfy mastery", () => {
    expect(canMaster([
      { supportLevel: "prompt-only", passed: true, answerRevealed: true },
      { supportLevel: "english", passed: true, answerRevealed: false },
      { supportLevel: "full", passed: true, answerRevealed: true }
    ])).toBe(false);
    expect(canMaster([
      { ...promptFreePass(), activity: "choice" },
      { supportLevel: "english", passed: true, answerRevealed: false },
      { supportLevel: "full", passed: false, answerRevealed: false }
    ])).toBe(false);
  });
});

const lesson: LessonDefinition = {
  exerciseIds: ["listen", "speak", "recall"],
  phraseIds: ["reservation"]
};

describe("lesson engine", () => {
  it("advances in authored order and records completion idempotently", () => {
    const initial = createLessonState();
    const afterFirst = completeExercise(lesson, initial, "listen");
    const afterDuplicate = completeExercise(lesson, afterFirst, "listen");

    expect(nextExercise(lesson, initial)).toBe("listen");
    expect(nextExercise(lesson, afterFirst)).toBe("speak");
    expect(afterDuplicate).toBe(afterFirst);
    expect(afterDuplicate.completedExerciseIds).toEqual(["listen"]);
  });

  it("resumes an interrupted stored session without re-awarding or skipping", () => {
    const interrupted = completeExercise(lesson, createLessonState(), "listen");
    const resumed = { ...interrupted, completedExerciseIds: [...interrupted.completedExerciseIds] };

    expect(nextExercise(lesson, resumed)).toBe("speak");
    const continued = completeExercise(lesson, resumed, "speak");
    expect(continued.completedExerciseIds).toEqual(["listen", "speak"]);
    expect(nextExercise(lesson, continued)).toBe("recall");
  });

  it("rejects unknown completion IDs safely", () => {
    expect(() => completeExercise(lesson, createLessonState(), "invented")).toThrow("Unknown exercise");
  });

  it("updates a phrase class from recorded attempt history", () => {
    let state = createLessonState();
    state = recordPhraseAttempt(lesson, state, "reservation", {
      passed: true,
      answerRevealed: true,
      supportLevel: "full"
    });
    state = recordPhraseAttempt(lesson, state, "reservation", {
      passed: true,
      answerRevealed: false,
      supportLevel: "english"
    });
    state = recordPhraseAttempt(lesson, state, "reservation", promptFreePass());

    expect(state.phraseClasses.reservation).toBe("mastered");
    expect(state.phraseAttempts.reservation).toHaveLength(3);
  });
});
