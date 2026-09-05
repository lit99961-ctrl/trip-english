import { describe, expect, it } from "vitest";
import { businessMissions } from "../../src/content/missions.business";
import { emergencyPhrases, emergencyCategories } from "../../src/content/emergency-phrases";
import { travelMissions } from "../../src/content/missions.travel";
import { allMissions, courseSessions, renderRoleplayPrompt } from "../../src/content/catalog";
import { scoreTranscript } from "../../src/domain/functional-score";

describe("itinerary course coverage", () => {
  const phraseById = (id: string) => allMissions
    .flatMap((mission) => mission.productionPhrases)
    .find((phrase) => phrase.id === id)!;

  const passesPhrase = (id: string, transcript: string) => scoreTranscript(transcript, {
    requiredKeywords: phraseById(id).requiredKeywordGroups
  }).passed;

  it("has the required mission and emergency phrase counts", () => {
    expect(travelMissions).toHaveLength(12);
    expect(businessMissions).toHaveLength(3);
    expect(emergencyPhrases).toHaveLength(50);
  });

  it("assembles exactly twelve travel sessions with business readings embedded only in 4, 8, and 11", () => {
    expect(courseSessions).toHaveLength(12);
    expect(courseSessions.map((session) => session.sessionNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(courseSessions.every((session) => session.travelMission.kind === "travel")).toBe(true);
    expect(courseSessions.filter((session) => session.businessMission).map((session) => session.sessionNumber)).toEqual([4, 8, 11]);
    expect(allMissions).toHaveLength(15);
  });

  it("uses score-compatible keyword alternatives for every model phrase", () => {
    for (const phrase of allMissions.flatMap((mission) => mission.productionPhrases)) {
      expect(phrase.requiredKeywordGroups.length, phrase.id).toBeGreaterThan(0);
      expect(phrase.requiredKeywordGroups.every((group) => group.length > 0), phrase.id).toBe(true);
      expect(scoreTranscript(phrase.english, { requiredKeywords: phrase.requiredKeywordGroups }).passed).toBe(true);
    }
    expect(scoreTranscript("I would like to check in.", { requiredKeywords: [["check in", "flight"]] }).passed).toBe(true);
    expect(scoreTranscript("I would like to check in.", { requiredKeywords: [["passport"]] }).passed).toBe(false);
  });

  it("rejects inadequate fragments for multi-concept travel and personal intents", () => {
    expect(passesPhrase("hk-checkin-check-in", "flight")).toBe(false);
    expect(passesPhrase("hk-checkin-seat", "window")).toBe(false);
    expect(passesPhrase("hk-checkin-repeat", "again")).toBe(false);
    expect(passesPhrase("helsinki-transfer-show", "screen")).toBe(false);
    expect(passesPhrase("urgent-help-phone", "phone")).toBe(false);
    expect(passesPhrase("email-action-travel", "Italy")).toBe(false);
    expect(passesPhrase("restaurant-table", "table")).toBe(false);
    expect(passesPhrase("restaurant-bill", "please")).toBe(false);
  });

  it("accepts short useful responses and authored alternatives", () => {
    expect(passesPhrase("hk-checkin-check-in", "want check in")).toBe(true);
    expect(passesPhrase("hk-checkin-seat", "window seat")).toBe(true);
    expect(passesPhrase("hk-checkin-repeat", "repeat slowly")).toBe(true);
    expect(passesPhrase("helsinki-transfer-show", "show screen")).toBe(true);
    expect(passesPhrase("urgent-help-phone", "phone charge")).toBe(true);
    expect(passesPhrase("email-action-travel", "travel Italy Switzerland")).toBe(true);
    expect(passesPhrase("restaurant-table", "table two")).toBe(true);
    expect(passesPhrase("restaurant-bill", "bill")).toBe(true);
    expect(passesPhrase("rome-arrival-baggage", "find baggage claim")).toBe(true);
  });

  it("binds every role-play variation to its prompt template", () => {
    for (const exercise of travelMissions.flatMap((mission) => mission.exercises).filter((item) => item.type === "roleplay")) {
      const rendered = renderRoleplayPrompt(exercise.promptTemplate, exercise.variation);
      const mission = travelMissions.find((item) => item.id === exercise.id.replace(/-roleplay$/, ""))!;
      const phrase = mission.productionPhrases.find((item) => item.id === exercise.phraseId)!;
      expect(rendered).not.toMatch(/\{[^}]+\}/);
      expect(rendered).not.toBe(exercise.promptTemplate);
      expect(Object.values(exercise.variation).some((value) => rendered.includes(value))).toBe(true);
      const score = scoreTranscript(rendered, { requiredKeywords: phrase.requiredKeywordGroups });
      expect(score.passed, `${mission.id}: ${rendered}`).toBe(true);
    }
  });

  it("exports deeply frozen course and emergency content", () => {
    expect(Object.isFrozen(courseSessions)).toBe(true);
    expect(Object.isFrozen(courseSessions[0]!)).toBe(true);
    expect(Object.isFrozen(courseSessions[0]!.travelMission.productionPhrases)).toBe(true);
    expect(Object.isFrozen(courseSessions[0]!.travelMission.productionPhrases[0]!.keywords)).toBe(true);
    expect(Object.isFrozen(emergencyPhrases)).toBe(true);
    expect(Object.isFrozen(emergencyPhrases[0]!)).toBe(true);
  });

  it("uses exactly thirty unique active production targets", () => {
    const targets = [...travelMissions, ...businessMissions]
      .flatMap((mission) => mission.productionPhrases)
      .filter((phrase) => phrase.activeTarget);

    expect(targets).toHaveLength(30);
    expect(new Set(targets.map((phrase) => phrase.id)).size).toBe(30);
  });

  it("requires every active target to express more than one semantic component", () => {
    const targets = allMissions
      .flatMap((mission) => mission.productionPhrases)
      .filter((phrase) => phrase.activeTarget);

    for (const phrase of targets) {
      expect(phrase.requiredKeywordGroups.length, phrase.id).toBeGreaterThanOrEqual(2);
      const incompleteFragment = phrase.requiredKeywordGroups[0]![0]!;
      expect(
        scoreTranscript(incompleteFragment, { requiredKeywords: phrase.requiredKeywordGroups }).passed,
        `${phrase.id}: ${incompleteFragment}`
      ).toBe(false);
      expect(
        scoreTranscript(phrase.english, { requiredKeywords: phrase.requiredKeywordGroups }).passed,
        phrase.id
      ).toBe(true);
    }
  });

  it("rejects representative bare travel objects", () => {
    expect(passesPhrase("hk-checkin-gate", "gate")).toBe(false);
    expect(passesPhrase("italy-high-speed-rail-platform", "platform")).toBe(false);
    expect(passesPhrase("shopping-tax-refund-size", "medium")).toBe(false);
  });

  it("keeps business active targets to the two personal introduction facts", () => {
    expect(businessMissions.flatMap((mission) => mission.productionPhrases)
      .filter((phrase) => phrase.activeTarget)
      .map((phrase) => phrase.english)).toEqual([
      "I work in the internet industry.",
      "I am traveling in Italy and Switzerland."
    ]);
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
        ...mission.exercises.flatMap((exercise) => exercise.type === "reading" ? exercise.readingText : [])
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

  it("uses semantic business reading IDs without unrelated phrase links", () => {
    const readingIds = businessMissions.flatMap((mission) =>
      mission.exercises.filter((exercise) => exercise.type === "reading").map((exercise) => exercise.id)
    );

    expect(readingIds).toEqual([
      "email-action-reading-sender", "email-action-reading-recipient", "email-action-reading-action", "email-action-reading-deadline", "email-action-reading-subject",
      "internet-headline-reading-company", "internet-headline-reading-product", "internet-headline-reading-addition", "internet-headline-reading-change-type", "internet-headline-reading-date",
      "message-intent-reading-request", "message-intent-reading-confirmer", "message-intent-reading-unavailable-person", "message-intent-reading-new-time", "message-intent-reading-next-step"
    ]);
    expect(businessMissions.flatMap((mission) => mission.exercises)
      .filter((exercise) => exercise.type === "reading")
      .every((exercise) => exercise.phraseId === undefined)).toBe(true);
  });

  it("links varied role-plays to phrases that match the rendered situation", () => {
    const roleplayFor = (missionId: string) => travelMissions.find((mission) => mission.id === missionId)!
      .exercises.find((exercise) => exercise.type === "roleplay")!;

    expect(roleplayFor("swiss-mountain-transit").phraseId).toBe("swiss-mountain-transit-return");
    expect(roleplayFor("urgent-help").phraseId).toBe("urgent-help-police");
    expect(renderRoleplayPrompt(roleplayFor("urgent-help").promptTemplate, roleplayFor("urgent-help").variation))
      .toContain("at the station entrance");
  });

  it("makes reading questions assessable and links personal active cards to practice", () => {
    for (const exercise of [...travelMissions, ...businessMissions].flatMap((mission) => mission.exercises).filter((item) => item.type === "reading")) {
      for (const question of exercise.questions) {
        expect(question.expectedAnswers.some((answer) => exercise.readingText.toLowerCase().includes(answer.toLowerCase()))).toBe(true);
      }
    }
    for (const phrase of businessMissions.flatMap((mission) => mission.productionPhrases).filter((phrase) => phrase.activeTarget)) {
      expect(businessMissions.some((mission) => mission.exercises.some((exercise) => exercise.phraseId === phrase.id))).toBe(true);
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
