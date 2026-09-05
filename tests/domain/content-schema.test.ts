import { describe, expect, it } from "vitest";
import { missionSchema, phraseSchema } from "../../src/domain/content-schema";

describe("missionSchema", () => {
  it("requires a recovery phrase and five to eight production phrases", () => {
    const invalid = { id: "hotel", titleZh: "酒店", productionPhrases: [], exercises: [] };

    expect(missionSchema.safeParse(invalid).success).toBe(false);
  });

  it("accepts five to eight phrases only when one is a recovery phrase", () => {
    const mission = {
      id: "hotel",
      kind: "travel",
      titleZh: "酒店",
      city: "Tokyo",
      productionPhrases: Array.from({ length: 5 }, (_, index) => ({
        id: `phrase-${index}`,
        english: `Phrase ${index}`,
        chinese: `短语 ${index}`,
        intent: "request",
        keywords: ["phrase"],
        recovery: false
      })),
      recognitionWords: ["hotel"],
      exercises: Array.from({ length: 5 }, (_, index) => ({
        id: `exercise-${index}`,
        type: "intent",
        promptZh: `练习 ${index}`
      }))
    };

    const withoutRecovery = missionSchema.safeParse(mission);
    expect(withoutRecovery.success).toBe(false);
    if (!withoutRecovery.success) {
      expect(withoutRecovery.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ message: "mission requires a recovery phrase" })
        ])
      );
    }

    mission.productionPhrases[0]!.recovery = true;
    expect(missionSchema.safeParse(mission).success).toBe(true);
    expect(missionSchema.safeParse({
      ...mission,
      productionPhrases: mission.productionPhrases.slice(0, 4)
    }).success).toBe(false);
    expect(missionSchema.safeParse({
      ...mission,
      productionPhrases: [...mission.productionPhrases, { ...mission.productionPhrases[0]!, id: "extra" }, { ...mission.productionPhrases[0]!, id: "extra-2" }, { ...mission.productionPhrases[0]!, id: "extra-3" }, { ...mission.productionPhrases[0]!, id: "extra-4" }]
    }).success).toBe(false);
  });

  it("retains active targets and requires business embedded-session metadata", () => {
    expect(phraseSchema.parse({
      id: "target", english: "I need help.", chinese: "我需要帮助。", intent: "help", keywords: ["help"]
    }).activeTarget).toBe(false);
    expect(phraseSchema.parse({
      id: "active-target", english: "I need help.", chinese: "我需要帮助。", intent: "help", keywords: ["help"], activeTarget: true
    }).activeTarget).toBe(true);

    const base = {
      id: "reading", titleZh: "阅读", city: "Reading practice",
      productionPhrases: Array.from({ length: 5 }, (_, index) => ({
        id: `reading-${index}`, english: `Phrase ${index}`, chinese: `短语 ${index}`,
        intent: "read", keywords: ["read"], recovery: index === 0
      })),
      recognitionWords: ["read"],
      exercises: Array.from({ length: 5 }, (_, index) => ({ id: `read-${index}`, type: "reading", promptZh: "阅读", readingText: "NOTICE: Read this sign." }))
    };

    expect(missionSchema.safeParse({ ...base, kind: "business" }).success).toBe(false);
    expect(missionSchema.safeParse({ ...base, kind: "business", embeddedSession: 8 }).success).toBe(true);
    expect(missionSchema.safeParse({ ...base, kind: "business", embeddedSession: 5 }).success).toBe(false);
    expect(missionSchema.safeParse({ ...base, kind: "travel", embeddedSession: 8 }).success).toBe(false);
  });

  it("requires real reading text and role-play variation", () => {
    const exerciseBase = { id: "exercise", promptZh: "练习" };
    const missionBase = {
      id: "exercise-check", kind: "travel", titleZh: "练习", city: "Rome",
      productionPhrases: Array.from({ length: 5 }, (_, index) => ({
        id: `exercise-phrase-${index}`, english: `Phrase ${index}`, chinese: `短语 ${index}`,
        intent: "practice", keywords: ["practice"], recovery: index === 0
      })),
      recognitionWords: ["notice"]
    };

    expect(missionSchema.safeParse({
      ...missionBase,
      exercises: Array.from({ length: 5 }, (_, index) => ({ ...exerciseBase, id: `reading-${index}`, type: "reading" }))
    }).success).toBe(false);
    expect(missionSchema.safeParse({
      ...missionBase,
      exercises: Array.from({ length: 5 }, (_, index) => ({ ...exerciseBase, id: `roleplay-${index}`, type: "roleplay" }))
    }).success).toBe(false);
  });

  it("rejects empty keyword groups and cross-type exercise fields", () => {
    expect(phraseSchema.safeParse({
      id: "bad-groups", english: "Help me.", chinese: "帮帮我。", intent: "help", keywords: ["help"], requiredKeywordGroups: [[]]
    }).success).toBe(false);

    const base = {
      id: "strict-exercises", kind: "travel", titleZh: "练习", city: "Rome",
      productionPhrases: Array.from({ length: 5 }, (_, index) => ({
        id: `strict-${index}`, english: `Phrase ${index}`, chinese: `短语 ${index}`, intent: "practice", keywords: ["phrase"], recovery: index === 0
      })), recognitionWords: ["notice"]
    };
    expect(missionSchema.safeParse({ ...base, exercises: Array.from({ length: 5 }, (_, index) => ({ id: `strict-read-${index}`, type: "reading", promptZh: "阅读", readingText: "NOTICE", variation: { item: "x" } })) }).success).toBe(false);
    expect(missionSchema.safeParse({ ...base, exercises: Array.from({ length: 5 }, (_, index) => ({ id: `strict-role-${index}`, type: "roleplay", promptZh: "对话", variation: {}, promptTemplate: "Hello" })) }).success).toBe(false);
    expect(missionSchema.safeParse({ ...base, exercises: Array.from({ length: 5 }, (_, index) => ({ id: `strict-role-${index}`, type: "roleplay", promptZh: "对话", variation: { item: "x" }, promptTemplate: "Hello" })) }).success).toBe(false);
  });
});
