import { describe, expect, it } from "vitest";
import { missionSchema, phraseSchema } from "../../src/domain/content-schema";

describe("missionSchema", () => {
  it("accepts only well-formed listening scenarios", () => {
    const phrase = {
      id: "listen-phrase", english: "Please help.", chinese: "请帮忙。", intent: "help",
      keywords: ["help"], requiredKeywordGroups: [["help"]], recovery: true
    };
    const scenario = {
      id: "room-ready", transcript: "Your room is ready now.", meaningZh: "房间已经准备好了。",
      distractorsZh: ["房间还没准备好。", "早餐在七点。"], keywords: ["room", "ready"]
    };
    const mission = {
      id: "listen-mission", kind: "travel", titleZh: "听力", city: "Rome",
      productionPhrases: Array.from({ length: 5 }, (_, index) => ({ ...phrase, id: `${phrase.id}-${index}` })),
      recognitionWords: ["ready"], listeningScenarios: [scenario, { ...scenario, id: "room-later" }, { ...scenario, id: "breakfast" }],
      exercises: Array.from({ length: 5 }, (_, index) => ({ id: `listen-${index}`, type: "intent", promptZh: "听懂意思" }))
    };

    expect(missionSchema.safeParse(mission).success).toBe(true);
    expect(missionSchema.safeParse({
      ...mission,
      listeningScenarios: [{ ...scenario, distractorsZh: [scenario.meaningZh, "早餐在七点。"] }, ...mission.listeningScenarios.slice(1)]
    }).success).toBe(false);
    expect(missionSchema.safeParse({
      ...mission,
      listeningScenarios: [{ ...scenario, keywords: ["one", "two", "three", "four", "five"] }, ...mission.listeningScenarios.slice(1)]
    }).success).toBe(false);
  });

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
        requiredKeywordGroups: [["phrase"]],
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
    expect(phraseSchema.safeParse({
      id: "missing-groups", english: "I need help.", chinese: "我需要帮助。", intent: "help", keywords: ["help"]
    }).success).toBe(false);
    expect(phraseSchema.parse({
      id: "target", english: "I need help.", chinese: "我需要帮助。", intent: "help", keywords: ["help"], requiredKeywordGroups: [["help"]]
    }).activeTarget).toBe(false);
    expect(phraseSchema.parse({
      id: "active-target", english: "I need help.", chinese: "我需要帮助。", intent: "help", keywords: ["help"], requiredKeywordGroups: [["help"]], activeTarget: true
    }).activeTarget).toBe(true);

    const base = {
      id: "reading", titleZh: "阅读", city: "Reading practice",
      productionPhrases: Array.from({ length: 5 }, (_, index) => ({
        id: `reading-${index}`, english: `Phrase ${index}`, chinese: `短语 ${index}`,
        intent: "read", keywords: ["read"], requiredKeywordGroups: [["read"]], recovery: index === 0
      })),
      recognitionWords: ["read"],
      exercises: Array.from({ length: 5 }, (_, index) => ({ id: `read-${index}`, type: "reading", promptZh: "阅读", readingText: "NOTICE: Read this sign.", questions: [{ id: "content", promptZh: "内容？", expectedAnswers: ["NOTICE"] }] }))
    };

    expect(missionSchema.safeParse({ ...base, kind: "business" }).success).toBe(false);
    expect(missionSchema.safeParse({ ...base, kind: "business", embeddedSession: 8 }).success).toBe(true);
    expect(missionSchema.safeParse({ ...base, kind: "business", embeddedSession: 8, exercises: [base.exercises[0]] }).success).toBe(true);
    expect(missionSchema.safeParse({ ...base, kind: "travel", exercises: [base.exercises[0]] }).success).toBe(false);
    expect(missionSchema.safeParse({ ...base, kind: "business", embeddedSession: 5 }).success).toBe(false);
    expect(missionSchema.safeParse({ ...base, kind: "travel", embeddedSession: 8 }).success).toBe(false);
  });

  it("requires real reading text and role-play variation", () => {
    const exerciseBase = { id: "exercise", promptZh: "练习" };
    const missionBase = {
      id: "exercise-check", kind: "travel", titleZh: "练习", city: "Rome",
      productionPhrases: Array.from({ length: 5 }, (_, index) => ({
        id: `exercise-phrase-${index}`, english: `Phrase ${index}`, chinese: `短语 ${index}`,
        intent: "practice", keywords: ["practice"], requiredKeywordGroups: [["practice"]], recovery: index === 0
      })),
      recognitionWords: ["notice"]
    };

    expect(missionSchema.safeParse({
      ...missionBase,
      exercises: Array.from({ length: 5 }, (_, index) => ({ ...exerciseBase, id: `reading-${index}`, type: "reading" }))
    }).success).toBe(false);
    expect(missionSchema.safeParse({
      ...missionBase,
      exercises: Array.from({ length: 5 }, (_, index) => ({ ...exerciseBase, id: `roleplay-${index}`, type: "roleplay", phraseId: "exercise-phrase-0" }))
    }).success).toBe(false);
  });

  it("rejects empty keyword groups and cross-type exercise fields", () => {
    expect(phraseSchema.safeParse({
      id: "bad-groups", english: "Help me.", chinese: "帮帮我。", intent: "help", keywords: ["help"], requiredKeywordGroups: [[]]
    }).success).toBe(false);

    const base = {
      id: "strict-exercises", kind: "travel", titleZh: "练习", city: "Rome",
      productionPhrases: Array.from({ length: 5 }, (_, index) => ({
        id: `strict-${index}`, english: `Phrase ${index}`, chinese: `短语 ${index}`, intent: "practice", keywords: ["phrase"], requiredKeywordGroups: [["phrase"]], recovery: index === 0
      })), recognitionWords: ["notice"]
    };
    expect(missionSchema.safeParse({ ...base, exercises: Array.from({ length: 5 }, (_, index) => ({ id: `strict-read-${index}`, type: "reading", promptZh: "阅读", readingText: "NOTICE", variation: { item: "x" } })) }).success).toBe(false);
    expect(missionSchema.safeParse({ ...base, exercises: Array.from({ length: 5 }, (_, index) => ({ id: `strict-role-${index}`, type: "roleplay", phraseId: "strict-0", promptZh: "对话", variation: {}, promptTemplate: "Hello" })) }).success).toBe(false);
    expect(missionSchema.safeParse({ ...base, exercises: Array.from({ length: 5 }, (_, index) => ({ id: `strict-role-${index}`, type: "roleplay", phraseId: "strict-0", promptZh: "对话", variation: { item: "x" }, promptTemplate: "Hello" })) }).success).toBe(false);
  });

  it("requires role-play phrase links and rejects unknown nested fields", () => {
    const phrase = {
      id: "strict-phrase", english: "Please help.", chinese: "请帮忙。", intent: "help",
      keywords: ["help"], requiredKeywordGroups: [["help"]], recovery: true
    };
    const phrases = Array.from({ length: 5 }, (_, index) => ({ ...phrase, id: `${phrase.id}-${index}` }));
    const roleplay = { id: "strict-roleplay", type: "roleplay", phraseId: "", promptZh: "对话", variation: { item: "help" }, promptTemplate: "Please {item}." };
    const travel = {
      id: "strict-mission", kind: "travel", titleZh: "严格", city: "Rome",
      productionPhrases: phrases, recognitionWords: ["help"],
      exercises: Array.from({ length: 5 }, (_, index) => ({ ...roleplay, id: `${roleplay.id}-${index}` }))
    };

    expect(missionSchema.safeParse(travel).success).toBe(false);
    expect(phraseSchema.safeParse(phrase).success).toBe(true);
    expect(phraseSchema.safeParse({ ...phrase, misspelledField: true }).success).toBe(false);
    const business = {
      id: "strict-business", kind: "business", titleZh: "严格", city: "Reading", embeddedSession: 8,
      productionPhrases: phrases, recognitionWords: ["help"],
      exercises: [{ id: "strict-reading", type: "reading", promptZh: "阅读", readingText: "HELP", questions: [{ id: "content", promptZh: "什么？", expectedAnswers: ["HELP"] }] }]
    };
    expect(missionSchema.safeParse(business).success).toBe(true);
    expect(missionSchema.safeParse({ ...business, unknownMissionField: true }).success).toBe(false);
    expect(missionSchema.safeParse({
      ...business,
      exercises: [{ ...business.exercises[0], questions: [{ ...business.exercises[0]!.questions[0], unknownQuestionField: true }] }]
    }).success).toBe(false);
  });

  it("rejects blank role-play values and malformed placeholder syntax", () => {
    const phrase = {
      id: "role-phrase", english: "I need two keys.", chinese: "我需要两把钥匙。", intent: "keys",
      keywords: ["keys"], requiredKeywordGroups: [["keys"]], recovery: true
    };
    const validRoleplay = { id: "role", type: "roleplay", phraseId: "role-phrase", promptZh: "对话", variation: { keys: "two" }, promptTemplate: "I need {keys} keys." };
    const mission = {
      id: "role-mission", kind: "travel", titleZh: "对话", city: "Rome",
      productionPhrases: Array.from({ length: 5 }, (_, index) => ({ ...phrase, id: index === 0 ? phrase.id : `${phrase.id}-${index}` })),
      recognitionWords: ["keys"], exercises: Array.from({ length: 5 }, (_, index) => ({ ...validRoleplay, id: `${validRoleplay.id}-${index}` }))
    };
    const withRoleplay = (roleplay: Record<string, unknown>) => ({ ...mission, exercises: mission.exercises.map((exercise, index) => index === 0 ? roleplay : exercise) });

    expect(missionSchema.safeParse(mission).success).toBe(true);
    expect(missionSchema.safeParse(withRoleplay({ ...validRoleplay, variation: { keys: "" } })).success).toBe(false);
    expect(missionSchema.safeParse(withRoleplay({ ...validRoleplay, variation: { keys: " " } })).success).toBe(false);
    expect(missionSchema.safeParse(withRoleplay({ ...validRoleplay, variation: { " keys ": "two" } })).success).toBe(false);
    expect(missionSchema.safeParse(withRoleplay({ ...validRoleplay, promptTemplate: "I need {keys}} keys." })).success).toBe(false);
    expect(missionSchema.safeParse(withRoleplay({ ...validRoleplay, promptTemplate: "I need { keys } keys." })).success).toBe(false);
    expect(missionSchema.safeParse(withRoleplay({ ...validRoleplay, promptTemplate: "I need {keys." })).success).toBe(false);
  });
});
