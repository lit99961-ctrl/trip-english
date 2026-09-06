import { describe, expect, it } from "vitest";
import { allMissions, assertUnique, catalog, renderRoleplayPrompt, validateCatalog } from "../../src/content/catalog";
import { deepFreeze } from "../../src/content/content-validation";
import { emergencyPhrases } from "../../src/content/emergency-phrases";

function candidateMission(overrides: Record<string, unknown> = {}) {
  return {
    id: "hotel",
    kind: "travel",
    titleZh: "入住酒店",
    city: "Milan",
    productionPhrases: [
      { id: "hotel-check-in", english: "I have a reservation.", chinese: "我有预订。", intent: "check-in", keywords: ["reservation"], requiredKeywordGroups: [["reservation"]], recovery: true },
      { id: "hotel-name", english: "My name is Li.", chinese: "我叫李。", intent: "identify", keywords: ["name"], requiredKeywordGroups: [["name"]] },
      { id: "hotel-room", english: "I need a room.", chinese: "我需要一个房间。", intent: "request-room", keywords: ["room"], requiredKeywordGroups: [["room"]] },
      { id: "hotel-key", english: "Could I have my key?", chinese: "我可以拿房卡吗？", intent: "request-key", keywords: ["key"], requiredKeywordGroups: [["key", "keys"]] },
      { id: "hotel-thanks", english: "Thank you.", chinese: "谢谢。", intent: "thanks", keywords: ["thank"], requiredKeywordGroups: [["thank"]] }
    ],
    recognitionWords: ["reservation"],
    exercises: [
      { id: "hotel-intent", type: "intent", phraseId: "hotel-check-in", promptZh: "选择入住意图" },
      { id: "hotel-shadow", type: "shadow", phraseId: "hotel-name", promptZh: "跟读姓名" },
      { id: "hotel-recall", type: "recall", phraseId: "hotel-room", promptZh: "回忆房间" },
      { id: "hotel-roleplay", type: "roleplay", phraseId: "hotel-key", promptZh: "索要房卡", variation: { keys: "two" }, promptTemplate: "I need {keys} keys." },
      { id: "hotel-reading", type: "reading", phraseId: "hotel-thanks", promptZh: "朗读致谢", readingText: "HOTEL NOTICE: THANK YOU.", questions: [{ id: "message", promptZh: "写了什么？", expectedAnswers: ["THANK YOU"] }] }
    ],
    ...overrides
  };
}

describe("course catalog", () => {
  it("keeps authored phrases text-only so third-party voices are never redistributed", () => {
    const phrases = allMissions.flatMap((mission) => mission.productionPhrases);

    expect(phrases).toHaveLength(100);
    expect(emergencyPhrases).toHaveLength(50);
    expect([...phrases, ...emergencyPhrases].every((phrase) =>
      !("audio" in phrase)
    )).toBe(true);
  });

  it("freezes mutable descendants even when their parent is already frozen", () => {
    const child = { value: "mutable" };
    const parent = Object.freeze({ child });

    deepFreeze(parent);

    expect(Object.isFrozen(child)).toBe(true);
  });

  it("rejects unsupported built-in collection and date objects", () => {
    expect(() => deepFreeze(new Date())).toThrow("plain records and arrays");
    expect(() => deepFreeze(new Map())).toThrow("plain records and arrays");
    expect(() => deepFreeze(new Set())).toThrow("plain records and arrays");
  });

  it("accepts the full catalog and an explicit valid catalog", () => {
    expect(validateCatalog()).toEqual(allMissions);
    expect(catalog).toHaveLength(12);
    expect(validateCatalog([candidateMission()])).toHaveLength(1);
  });

  it("rejects invalid mission shapes", () => {
    expect(() => validateCatalog([{ id: "bad" }])).toThrow();
  });

  it("rejects duplicate IDs", () => {
    expect(() => assertUnique(["one", "two", "one", "two"], "mission")).toThrow(
      "mission duplicate ids: one, two"
    );
    expect(() => validateCatalog([candidateMission(), candidateMission()])).toThrow(
      "mission duplicate ids: hotel"
    );
    expect(() => validateCatalog([candidateMission(), candidateMission({ id: "hotel-2", productionPhrases: candidateMission().productionPhrases.map((phrase) => ({ ...phrase, id: "hotel-check-in" })) })])).toThrow(
      "production phrase duplicate ids: hotel-check-in"
    );
    expect(() => validateCatalog([candidateMission({ exercises: candidateMission().exercises.map((exercise, index) => index === 1 ? { ...exercise, id: "hotel-intent" } : exercise) })])).toThrow(
      "exercise duplicate ids: hotel-intent"
    );
  });

  it("rejects exercise IDs reused across missions", () => {
    const firstMission = candidateMission();
    const secondMission = candidateMission({
      id: "hotel-2",
      productionPhrases: firstMission.productionPhrases.map((phrase) => ({
        ...phrase,
        id: `${phrase.id}-2`
      })),
      exercises: firstMission.exercises.map((exercise) => ({
        ...exercise,
        phraseId: exercise.phraseId === undefined ? undefined : `${exercise.phraseId}-2`
      }))
    });

    expect(() => validateCatalog([firstMission, secondMission])).toThrow(
      "exercise duplicate ids: hotel-intent, hotel-shadow, hotel-recall, hotel-roleplay, hotel-reading"
    );
  });

  it("rejects exercises that reference a phrase outside their mission", () => {
    expect(() => validateCatalog([candidateMission({ exercises: candidateMission().exercises.map((exercise, index) => index === 0 ? { ...exercise, phraseId: "missing-phrase" } : exercise) })])).toThrow(
      "exercise hotel-intent references missing phraseId: missing-phrase"
    );
  });

  it("rejects a role-play whose rendered prompt does not satisfy its linked phrase", () => {
    expect(() => validateCatalog([candidateMission({
      exercises: candidateMission().exercises.map((exercise) => exercise.type === "roleplay"
        ? { ...exercise, promptTemplate: "I need {keys} passports." }
        : exercise)
    })])).toThrow("roleplay hotel-roleplay does not satisfy linked phrase hotel-key");
  });

  it("rejects malformed role-play templates and values at rendering and catalog boundaries", () => {
    expect(() => renderRoleplayPrompt("I need {keys}}.", { keys: "two" })).toThrow("unresolved or malformed placeholder");
    expect(() => renderRoleplayPrompt("I need { keys }.", { keys: "two" })).toThrow("unresolved or malformed placeholder");
    expect(() => renderRoleplayPrompt("I need {keys.", { keys: "two" })).toThrow("unresolved or malformed placeholder");
    expect(() => validateCatalog([candidateMission({
      exercises: candidateMission().exercises.map((exercise) => exercise.type === "roleplay"
        ? { ...exercise, promptTemplate: "I need {keys}}." }
        : exercise)
    })])).toThrow();
    expect(() => validateCatalog([candidateMission({
      exercises: candidateMission().exercises.map((exercise) => exercise.type === "roleplay"
        ? { ...exercise, variation: { keys: " " } }
        : exercise)
    })])).toThrow();
  });

  it("rejects duplicate reading question IDs", () => {
    expect(() => validateCatalog([candidateMission({
      exercises: candidateMission().exercises.map((exercise) => exercise.type === "reading"
        ? { ...exercise, questions: [exercise.questions![0], { ...exercise.questions![0] }] }
        : exercise)
    })])).toThrow("reading question ids must be unique");
  });
});
