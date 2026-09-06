import { afterEach, describe, expect, it, vi } from "vitest";
import { courseSessions } from "../../src/content/catalog";
import { createLearnerProgressV1 } from "../../src/domain/progress";
import { renderHome } from "../../src/features/home/home-view";

afterEach(() => document.body.replaceChildren());

describe("travel journal home", () => {
  it("restores today's active mission and keeps one primary action", async () => {
    const progress = createLearnerProgressV1(new Date("2026-09-05T00:00:00Z"));
    progress.activeMissionId = "venice-vaporetto";
    const onStartMission = vi.fn();
    const view = await renderHome({
      repository: { load: vi.fn(async () => progress) },
      now: () => new Date("2026-09-05T12:00:00Z"),
      onStartMission
    });
    document.body.append(view);

    expect(view.textContent).toContain("Day 8");
    expect(view.textContent).toContain("Venice");
    expect(view.textContent).toContain("威尼斯水上巴士");
    expect(view.querySelectorAll(".primary-action")).toHaveLength(1);
    view.querySelector<HTMLButtonElement>(".primary-action")!.click();
    expect(onStartMission).toHaveBeenCalledWith("venice-vaporetto");
  });

  it("shows due reviews and only authored domain mastery labels", async () => {
    const progress = createLearnerProgressV1(new Date("2026-09-01T00:00:00Z"));
    progress.activeMissionId = "hotel-checkin";
    progress.savedPhraseIds = ["em-help-112", "em-help-lost"];
    progress.phraseReviews.one = {
      dueAt: "2026-09-05T11:00:00.000Z",
      successfulAttempts: 1,
      hintCount: 0
    };
    progress.sessions["hotel-checkin"] = {
      missionId: "hotel-checkin",
      completedExerciseIds: [],
      phraseClasses: {
        "hotel-checkin-reservation": "mastered",
        "hotel-checkin-name": "practiced"
      }
    };
    const view = await renderHome({
      repository: { load: async () => progress },
      now: () => new Date("2026-09-05T12:00:00Z")
    });

    expect(view.textContent).toContain("待复习 1");
    expect(view.textContent).toContain("收藏 2");
    expect(view.querySelector('[data-mastery="mastered"]')).toBeNull();
    expect(view.querySelector('[data-mastery="practiced"]')?.textContent).toBe("练习中 2/15");
    expect(view.textContent).not.toContain("100%");
    expect(view.querySelectorAll("[data-route-node]")).toHaveLength(12);
  });

  it("only stamps a city mastered when every authored phrase is mastered", async () => {
    const progress = createLearnerProgressV1();
    progress.activeMissionId = "hk-checkin";
    const phraseIds = [
      "hk-checkin-check-in", "hk-checkin-passport", "hk-checkin-bag",
      "hk-checkin-seat", "hk-checkin-gate", "hk-checkin-repeat"
    ];
    progress.sessions["hk-checkin"] = {
      missionId: "hk-checkin", completedExerciseIds: [],
      phraseClasses: Object.fromEntries(phraseIds.map((id) => [id, "mastered" as const]))
    };
    const view = await renderHome({ repository: { load: async () => progress } });
    expect(view.querySelector('[data-route-node][aria-current="step"] [data-mastery="mastered"]')?.textContent)
      .toBe("已掌握");
  });

  it("includes an embedded business mission in that day's city stamp", async () => {
    const progress = createLearnerProgressV1();
    progress.activeMissionId = "hotel-checkin";
    const session = courseSessions.find(({ travelMission }) => travelMission.id === "hotel-checkin")!;
    const travelPhraseIds = session.travelMission.productionPhrases.map(({ id }) => id);
    progress.sessions["hotel-checkin"] = {
      missionId: "hotel-checkin", completedExerciseIds: [],
      phraseClasses: Object.fromEntries(travelPhraseIds.map((id) => [id, "mastered" as const]))
    };

    const view = await renderHome({ repository: { load: async () => progress } });

    const currentStamp = view.querySelector('[data-route-node][aria-current="step"] [data-mastery]');
    expect(currentStamp?.getAttribute("data-mastery")).toBe("practiced");
    expect(currentStamp?.textContent).toBe(`练习中 ${travelPhraseIds.length}/${
      travelPhraseIds.length + session.businessMission!.productionPhrases.length
    }`);
  });

  it("moves to the next unfinished mission after the active mission is complete", async () => {
    const progress = createLearnerProgressV1();
    progress.activeMissionId = "hk-checkin";
    progress.sessions["hk-checkin"] = {
      missionId: "hk-checkin",
      completedExerciseIds: [
        "hk-checkin-intent", "hk-checkin-shadow-1", "hk-checkin-shadow-2",
        "hk-checkin-recall", "hk-checkin-roleplay", "hk-checkin-reading"
      ]
    };
    const view = await renderHome({ repository: { load: async () => progress } });

    expect(view.textContent).toContain("Day 2");
    expect(view.textContent).toContain("赫尔辛基转机");
  });
});
