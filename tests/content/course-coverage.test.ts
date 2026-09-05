import { describe, expect, it } from "vitest";
import { businessMissions } from "../../src/content/missions.business";
import { emergencyPhrases, emergencyCategories } from "../../src/content/emergency-phrases";
import { travelMissions } from "../../src/content/missions.travel";

describe("itinerary course coverage", () => {
  it("has the required mission and emergency phrase counts", () => {
    expect(travelMissions).toHaveLength(12);
    expect(businessMissions).toHaveLength(3);
    expect(emergencyPhrases).toHaveLength(50);
  });

  it("uses exactly thirty unique active production targets", () => {
    const targets = [...travelMissions, ...businessMissions]
      .flatMap((mission) => mission.productionPhrases)
      .filter((phrase) => phrase.activeTarget);

    expect(targets).toHaveLength(30);
    expect(new Set(targets.map((phrase) => phrase.id)).size).toBe(30);
  });

  it("gives every travel mission recovery language and varied role-play", () => {
    for (const mission of travelMissions) {
      expect(mission.productionPhrases.some((phrase) => phrase.recovery)).toBe(true);
      expect(
        mission.exercises.some(
          (exercise) => exercise.type === "roleplay" && exercise.variation !== undefined
        )
      ).toBe(true);
    }
  });

  it("follows the itinerary order and embeds only the three reading missions", () => {
    expect(travelMissions.map((mission) => mission.id)).toEqual([
      "hk-checkin", "helsinki-transfer", "rome-arrival", "hotel-checkin",
      "directions-tickets", "restaurant", "italy-high-speed-rail", "venice-vaporetto",
      "milan-swiss-transfer", "swiss-mountain-transit", "shopping-tax-refund", "urgent-help"
    ]);
    expect(businessMissions.map((mission) => mission.id)).toEqual([
      "email-action", "internet-headline", "message-intent"
    ]);
    expect(businessMissions.map((mission) => mission.embeddedSession)).toEqual([4, 8, 11]);
    expect(travelMissions.every((mission) => mission.embeddedSession === undefined)).toBe(true);
  });

  it("uses the complete travel exercise mix with local phrase references", () => {
    for (const mission of travelMissions) {
      const types = mission.exercises.map((exercise) => exercise.type);
      const phraseIds = new Set(mission.productionPhrases.map((phrase) => phrase.id));
      expect(types.filter((type) => type === "shadow")).toHaveLength(2);
      expect(types).toEqual(expect.arrayContaining(["intent", "recall", "roleplay", "reading"]));
      expect(mission.exercises.every((exercise) => !exercise.phraseId || phraseIds.has(exercise.phraseId))).toBe(true);
    }
  });

  it("keeps emergency phrases complete, unique, short, and free of contact details", () => {
    const categoryCounts = Object.fromEntries(
      emergencyCategories.map((category) => [
        category,
        emergencyPhrases.filter((phrase) => phrase.category === category).length
      ])
    );
    expect(categoryCounts).toEqual({ airport: 8, hotel: 8, transport: 10, restaurant: 7, shopping: 5, medical: 6, "general-help": 6 });
    expect(new Set(emergencyPhrases.map((phrase) => phrase.id)).size).toBe(50);
    expect(new Set(emergencyPhrases.map((phrase) => phrase.english)).size).toBe(50);

    const allPhrases = [...travelMissions, ...businessMissions].flatMap((mission) => mission.productionPhrases);
    for (const phrase of [...allPhrases, ...emergencyPhrases]) {
      expect(phrase.english.length).toBeLessThanOrEqual(80);
      expect(phrase.english).not.toMatch(/(?:@|e-?mail\s*:\s*\S+|\bemail\s*:\s*\S+|\btel\.?\s*:\s*\S+|\d{4,})/i);
      expect(phrase.keywords.length).toBeGreaterThan(0);
    }
  });
});
