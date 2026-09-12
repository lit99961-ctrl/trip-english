import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp, createAppShell } from "../../src/app/create-app";
import { createLearnerProgressV1 } from "../../src/domain/progress";
import { travelMissions } from "../../src/content/missions.travel";
import type { ProgressRepository } from "../../src/storage/progress-repository";
import type { SpeechPort } from "../../src/speech/speech-port";

function dependencies(progress = createLearnerProgressV1(), calibrated = true) {
  if (calibrated) {
    progress.calibration ??= {
      supportLevel: "full", correctItems: 0, speakingSeconds: 0,
      completedAt: "2026-09-05T00:00:00.000Z", recordingKeys: []
    };
  }
  const repository: ProgressRepository = {
    load: vi.fn(async () => progress), saveExerciseResult: vi.fn(), saveCalibrationResult: vi.fn(),
    savePhraseId: vi.fn(async () => progress), saveLookup: vi.fn(async () => progress),
    ensureDailyPlan: vi.fn(async (date, missionIds) => {
      progress.dailyPlans = { ...(progress.dailyPlans ?? {}), [date]: { missionIds: [...missionIds] } };
      return progress;
    }),
    advanceMissionIntroduction: vi.fn(async () => progress),
    saveRecording: vi.fn(), loadRecording: vi.fn(), beginRestore: vi.fn(), rollbackRestore: vi.fn(),
    finalizeRestore: vi.fn(), reset: vi.fn(), close: vi.fn()
  };
  const speech: SpeechPort = {
    speak: vi.fn(), startRecording: vi.fn(), recognize: vi.fn(),
    recognitionMode: vi.fn(async () => "self-rating" as const)
  };
  return { repository, speech };
}

describe("app shell", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("exposes only the three approved destinations", () => {
    document.body.append(createAppShell());
    const links = [...document.querySelectorAll("nav a")];
    const labels = links.map((node) => node.textContent);
    const hrefs = links.map((node) => node.getAttribute("href"));

    expect(labels).toEqual(["首页", "急救箱", "进度"]);
    expect(hrefs).toEqual(["#/home", "#/emergency", "#/progress"]);
  });

  it("provides a focusable route outlet", () => {
    document.body.append(createAppShell());

    const outlet = document.querySelector("main#route-outlet");

    expect(outlet).not.toBeNull();
    expect(outlet?.getAttribute("tabindex")).toBe("-1");
  });

  it("renders destinations and responds to app navigation", async () => {
    const progress = createLearnerProgressV1();
    const { repository, speech } = dependencies(progress);
    window.location.hash = "#/home";
    const app = createApp({ repository, speech, requestPersistence: async () => "unsupported" });
    document.body.append(app);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(app.querySelector("h1")?.textContent).toContain("香港机场值机");

    app.dispatchEvent(new CustomEvent("app:navigate", { bubbles: true, detail: { href: "#/emergency" } }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(app.querySelector("h1")?.textContent).toBe("救命句卡");
    expect(document.activeElement).toBe(app.querySelector("h1"));
    app.dispose();
  });

  it("lets a brand-new learner study before the two-minute calibration", async () => {
    const progress = createLearnerProgressV1();
    const { repository, speech } = dependencies(progress, false);
    window.location.hash = "#/home";
    const app = createApp({ repository, speech });
    document.body.append(app);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(app.querySelector(".home-view")).not.toBeNull();
    expect(app.textContent).not.toContain("2 分钟起点小游戏");

    window.location.hash = "#/lesson/hotel-checkin";
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(app.querySelector(".learning-view")).not.toBeNull();
    expect(app.querySelector(".calibration-view")).toBeNull();
    app.dispose();
  });

  it("asks for calibration only when an uncalibrated learner starts a formal challenge", async () => {
    const progress = createLearnerProgressV1();
    const hotel = travelMissions.find((mission) => mission.id === "hotel-checkin")!;
    progress.missionIntroductions = { [hotel.id]: {
      missionId: hotel.id,
      nextSentenceIndex: hotel.learningSentences!.length,
      viewedSentenceIds: hotel.learningSentences!.map((sentence) => sentence.id),
      shadowedSentenceIds: [],
      completedRecapIndexes: [5, 10, 15],
      completedAt: "2026-09-12T08:00:00.000Z"
    } };
    const { repository, speech } = dependencies(progress, false);
    window.location.hash = "#/challenge/hotel-checkin";
    const app = createApp({ repository, speech });
    document.body.append(app);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(app.querySelector(".calibration-view")).not.toBeNull();
    expect(app.querySelector(".lesson-view")).toBeNull();
    app.dispose();
  });

  it("opens the daily sprint, gates its lesson behind learning and browser back returns to the sprint", async () => {
    const progress = createLearnerProgressV1();
    progress.activeMissionId = "hotel-checkin";
    const { repository, speech } = dependencies(progress);
    window.location.hash = "#/home";
    const app = createApp({ repository, speech });
    document.body.append(app);
    await new Promise((resolve) => setTimeout(resolve, 0));
    app.querySelector<HTMLButtonElement>("button.primary-action")!.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(window.location.hash).toBe("#/sprint");
    app.querySelector<HTMLButtonElement>("button.primary-action")!.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(window.location.hash).toBe("#/sprint/learn/hotel-checkin");
    expect(app.querySelector(".learning-view")).not.toBeNull();
    expect(app.querySelector(".lesson-view")).toBeNull();

    window.history.back();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(window.location.hash).toBe("#/sprint");
    expect(app.querySelector(".sprint-view")).not.toBeNull();
    app.dispose();
  });

  it("gates a refreshed lesson deep link, offers repeat entry, and rejects unknown mission ids", async () => {
    const { repository, speech } = dependencies();
    window.location.hash = "#/lesson/hotel-checkin";
    const app = createApp({ repository, speech });
    document.body.append(app);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(app.querySelector(".learning-view")).not.toBeNull();
    app.dispose();

    const legacy = createLearnerProgressV1();
    const hotel = travelMissions.find((mission) => mission.id === "hotel-checkin")!;
    legacy.sessions["hotel-checkin"] = {
      missionId: "hotel-checkin", completedExerciseIds: [hotel.exercises[0]!.id]
    };
    const legacyDependencies = dependencies(legacy);
    window.location.hash = "#/lesson/hotel-checkin";
    const returning = createApp(legacyDependencies);
    document.body.replaceChildren(returning);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(returning.querySelector(".mission-entry-view")).not.toBeNull();
    window.location.hash = "#/challenge/hotel-checkin";
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(returning.querySelector(".lesson-view")).not.toBeNull();
    returning.dispose();

    window.location.hash = "#/lesson/not-a-real-mission";
    const invalid = createApp({ repository, speech });
    document.body.replaceChildren(invalid);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(invalid.textContent).toContain("任务不存在");
    expect(invalid.querySelector(".lesson-view")).toBeNull();
    invalid.dispose();
  });

  it("keeps a sprint review deep link inside the sprint flow", async () => {
    const { repository, speech } = dependencies();
    window.location.hash = "#/sprint/review/morning";
    const app = createApp({ repository, speech });
    document.body.append(app);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(window.location.hash).toBe("#/sprint/review/morning");
    expect(app.querySelector(".review-view")).not.toBeNull();
    app.dispose();
  });
});
