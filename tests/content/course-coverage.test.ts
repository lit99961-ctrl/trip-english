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
      const recoveryPhrases = mission.productionPhrases.filter((phrase) => phrase.recovery);
      expect(recoveryPhrases.length).toBeGreaterThan(0);
      expect(recoveryPhrases.every((phrase) => phrase.intent.startsWith("recover-"))).toBe(true);
      expect(
        mission.exercises.some(
          (exercise) => exercise.type === "roleplay" && exercise.variation !== undefined
        )
      ).toBe(true);
    }
  });

  it("marks business recovery language with an explicit recovery intent", () => {
    for (const mission of businessMissions) {
      const recoveryPhrases = mission.productionPhrases.filter((phrase) => phrase.recovery);
      expect(recoveryPhrases.length).toBeGreaterThan(0);
      expect(recoveryPhrases.every((phrase) => phrase.intent.startsWith("recover-"))).toBe(true);
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
      const shadowPhraseIds = mission.exercises
        .filter((exercise) => exercise.type === "shadow")
        .map((exercise) => exercise.phraseId);
      expect(shadowPhraseIds).toHaveLength(2);
      expect(new Set(shadowPhraseIds).size).toBe(2);
      expect(types).toEqual(expect.arrayContaining(["intent", "recall", "roleplay", "reading"]));
      expect(mission.exercises.every((exercise) => !exercise.phraseId || phraseIds.has(exercise.phraseId))).toBe(true);
    }
  });

  it("gives every travel reading exercise a credible, unique real-world text", () => {
    const readings = travelMissions.flatMap((mission) =>
      mission.exercises.filter((exercise) => exercise.type === "reading")
    );

    expect(readings).toHaveLength(12);
    expect(new Set(readings.map((exercise) => exercise.readingText)).size).toBe(12);
    for (const exercise of readings) {
      expect(exercise.readingText).toMatch(/\S/);
      expect(exercise.readingText!.length).toBeGreaterThanOrEqual(12);
      expect(exercise.readingText).not.toBe(exercise.promptZh);
    }
  });

  it("rehearses the added itinerary anchors without specific booking details", () => {
    const textFor = (id: string) => {
      const mission = travelMissions.find((item) => item.id === id)!;
      return [
        ...mission.productionPhrases.map((phrase) => phrase.english),
        ...mission.recognitionWords,
        ...mission.exercises.flatMap((exercise) => exercise.readingText ?? [])
      ].join(" ").toLowerCase();
    };

    expect(textFor("hotel-checkin")).toContain("self check-in");
    expect(textFor("directions-tickets")).toMatch(/vatican.*open|open.*vatican/);
    expect(textFor("swiss-mountain-transit")).toEqual(expect.stringContaining("lungern"));
    expect(textFor("swiss-mountain-transit")).toEqual(expect.stringContaining("lucerne"));
    expect(textFor("swiss-mountain-transit")).toEqual(expect.stringContaining("zurich airport"));
    expect(textFor("urgent-help")).toEqual(expect.stringContaining("toilet"));
    expect(textFor("urgent-help")).toEqual(expect.stringContaining("bag"));
  });

  it("provides multi-line, mission-specific business reading artifacts", () => {
    const readingFor = (id: string) => businessMissions.find((mission) => mission.id === id)!
      .exercises.find((exercise) => exercise.type === "reading")!.readingText!;
    const email = readingFor("email-action");
    const headline = readingFor("internet-headline");
    const message = readingFor("message-intent");

    expect(email.split("\n").filter(Boolean).length).toBeGreaterThanOrEqual(4);
    expect(email).toMatch(/from:/i);
    expect(email).toMatch(/subject:/i);
    expect(email).toMatch(/send/i);
    expect(email).toMatch(/friday/i);

    expect(headline.split("\n").filter(Boolean).length).toBeGreaterThanOrEqual(3);
    expect(headline).toMatch(/headline:/i);
    expect(headline).toMatch(/summary:/i);
    expect(headline).toMatch(/launch|update|problem/i);

    expect(message.split("\n").filter(Boolean).length).toBeGreaterThanOrEqual(5);
    expect(message).toMatch(/could you|please/i);
    expect(message).toMatch(/yes/i);
    expect(message).toMatch(/cannot|can't/i);
    expect(message).toMatch(/schedule|meeting/i);
    expect(message).toMatch(/next step/i);
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
