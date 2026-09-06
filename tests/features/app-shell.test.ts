import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp, createAppShell } from "../../src/app/create-app";
import { createLearnerProgressV1 } from "../../src/domain/progress";
import type { ProgressRepository } from "../../src/storage/progress-repository";
import type { SpeechPort } from "../../src/speech/speech-port";

function dependencies(progress = createLearnerProgressV1()) {
  progress.calibration ??= {
    supportLevel: "full", correctItems: 0, speakingSeconds: 0,
    completedAt: "2026-09-05T00:00:00.000Z", recordingKeys: []
  };
  const repository: ProgressRepository = {
    load: vi.fn(async () => progress), saveExerciseResult: vi.fn(), saveCalibrationResult: vi.fn(),
    savePhraseId: vi.fn(async () => progress), saveLookup: vi.fn(async () => progress),
    saveRecording: vi.fn(), loadRecording: vi.fn(), beginRestore: vi.fn(), rollbackRestore: vi.fn(),
    finalizeRestore: vi.fn(), reset: vi.fn(), close: vi.fn()
  };
  const speech: SpeechPort = {
    playFixed: vi.fn(), speak: vi.fn(), startRecording: vi.fn(), recognize: vi.fn(),
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

  it("deep-links to a validated lesson and browser back returns home", async () => {
    const { repository, speech } = dependencies();
    window.location.hash = "#/home";
    const app = createApp({ repository, speech });
    document.body.append(app);
    await new Promise((resolve) => setTimeout(resolve, 0));
    app.querySelector<HTMLButtonElement>("button.primary-action")!.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(window.location.hash).toBe("#/lesson/hk-checkin");
    expect(app.querySelector(".lesson-view")).not.toBeNull();

    window.history.back();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(window.location.hash).toBe("#/home");
    expect(app.querySelector(".home-view")).not.toBeNull();
    app.dispose();
  });

  it("refreshes a lesson deep link and rejects unknown mission ids", async () => {
    const { repository, speech } = dependencies();
    window.location.hash = "#/lesson/venice-vaporetto";
    const app = createApp({ repository, speech });
    document.body.append(app);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(app.querySelector(".lesson-view")).not.toBeNull();
    app.dispose();

    window.location.hash = "#/lesson/not-a-real-mission";
    const invalid = createApp({ repository, speech });
    document.body.replaceChildren(invalid);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(invalid.textContent).toContain("任务不存在");
    expect(invalid.querySelector(".lesson-view")).toBeNull();
    invalid.dispose();
  });
});
