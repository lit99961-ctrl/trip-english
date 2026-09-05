import { describe, expect, it } from "vitest";
import { assertUnique, catalog, validateCatalog } from "../../src/content/catalog";

function candidateMission(overrides: Record<string, unknown> = {}) {
  return {
    id: "hotel",
    kind: "travel",
    titleZh: "入住酒店",
    city: "Tokyo",
    productionPhrases: [
      { id: "hotel-check-in", english: "I have a reservation.", chinese: "我有预订。", intent: "check-in", keywords: ["reservation"], recovery: true },
      { id: "hotel-name", english: "My name is Li.", chinese: "我叫李。", intent: "identify", keywords: ["name"] },
      { id: "hotel-room", english: "I need a room.", chinese: "我需要一个房间。", intent: "request-room", keywords: ["room"] },
      { id: "hotel-key", english: "Could I have my key?", chinese: "我可以拿房卡吗？", intent: "request-key", keywords: ["key"] },
      { id: "hotel-thanks", english: "Thank you.", chinese: "谢谢。", intent: "thanks", keywords: ["thank"] }
    ],
    recognitionWords: ["reservation"],
    exercises: [
      { id: "hotel-intent", type: "intent", phraseId: "hotel-check-in", promptZh: "选择入住意图" },
      { id: "hotel-shadow", type: "shadow", phraseId: "hotel-name", promptZh: "跟读姓名" },
      { id: "hotel-recall", type: "recall", phraseId: "hotel-room", promptZh: "回忆房间" },
      { id: "hotel-roleplay", type: "roleplay", phraseId: "hotel-key", promptZh: "索要房卡" },
      { id: "hotel-reading", type: "reading", phraseId: "hotel-thanks", promptZh: "朗读致谢" }
    ],
    ...overrides
  };
}

describe("course catalog", () => {
  it("accepts the seed catalog and an explicit valid catalog", () => {
    expect(validateCatalog()).toEqual(catalog);
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

  it("rejects exercises that reference a phrase outside their mission", () => {
    expect(() => validateCatalog([candidateMission({ exercises: candidateMission().exercises.map((exercise, index) => index === 0 ? { ...exercise, phraseId: "missing-phrase" } : exercise) })])).toThrow(
      "exercise hotel-intent references missing phraseId: missing-phrase"
    );
  });
});
