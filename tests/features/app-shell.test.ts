import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp, createAppShell } from "../../src/app/create-app";
import { createLearnerProgressV1 } from "../../src/domain/progress";
import type { ProgressRepository } from "../../src/storage/progress-repository";
import type { SpeechPort } from "../../src/speech/speech-port";

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
    progress.calibration = {
      supportLevel: "full", correctItems: 0, speakingSeconds: 0,
      completedAt: "2026-09-05T00:00:00.000Z", recordingKeys: []
    };
    const repository: ProgressRepository = {
      load: vi.fn(async () => progress), saveExerciseResult: vi.fn(), saveCalibrationResult: vi.fn(),
      saveRecording: vi.fn(), loadRecording: vi.fn(), beginRestore: vi.fn(), rollbackRestore: vi.fn(),
      finalizeRestore: vi.fn(), reset: vi.fn(), close: vi.fn()
    };
    const speech: SpeechPort = {
      playFixed: vi.fn(), speak: vi.fn(), startRecording: vi.fn(), recognize: vi.fn(),
      recognitionMode: vi.fn(async () => "self-rating" as const)
    };
    window.location.hash = "#/home";
    const app = createApp({ repository, speech, requestPersistence: async () => "unsupported" });
    document.body.append(app);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(app.querySelector("h1")?.textContent).toContain("香港机场值机");

    app.dispatchEvent(new CustomEvent("app:navigate", { bubbles: true, detail: { href: "#/emergency" } }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(app.querySelector("h1")?.textContent).toBe("救命句卡");
    app.dispose();
  });
});
