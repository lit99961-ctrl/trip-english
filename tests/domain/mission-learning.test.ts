import { describe, expect, it } from "vitest";
import { travelMissions } from "../../src/content/missions.travel";
import { createLearnerProgressV1 } from "../../src/domain/progress";
import { groupPhraseMap, introductionComplete, nextLearningScreen } from "../../src/domain/mission-learning";

const hotel = travelMissions.find((mission) => mission.id === "hotel-checkin")!;

describe("mission learning controller", () => {
  it("inserts recaps at 5, 10 and 15 before the phrase map", () => {
    const sentences = hotel.learningSentences!;
    expect(nextLearningScreen(sentences, undefined)).toEqual({ type: "sentence", index: 0 });
    expect(nextLearningScreen(sentences, {
      missionId: hotel.id, nextSentenceIndex: 5,
      viewedSentenceIds: sentences.slice(0, 5).map((item) => item.id),
      shadowedSentenceIds: [], completedRecapIndexes: []
    })).toEqual({ type: "recap", index: 5 });
    expect(nextLearningScreen(sentences, {
      missionId: hotel.id, nextSentenceIndex: sentences.length,
      viewedSentenceIds: sentences.map((item) => item.id), shadowedSentenceIds: [],
      completedRecapIndexes: [5, 10, 15]
    })).toEqual({ type: "phrase-map" });
  });

  it("groups what I say and hear without treating old learners as new", () => {
    const groups = groupPhraseMap(hotel.learningSentences!);
    expect(groups.production).toHaveLength(8);
    expect(groups.reception).toHaveLength(8);
    const progress = createLearnerProgressV1();
    expect(introductionComplete(progress, hotel)).toBe(false);
    progress.sessions[hotel.id] = { missionId: hotel.id, completedExerciseIds: [hotel.exercises[0]!.id] };
    expect(introductionComplete(progress, hotel)).toBe(true);
  });
});
