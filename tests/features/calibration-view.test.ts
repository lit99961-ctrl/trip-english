import { afterEach, describe, expect, it, vi } from "vitest";
import { calibrationItems, renderCalibration, type CalibrationStore } from "../../src/features/calibration/calibration-view";
import type { RecordingSession, SpeechPort } from "../../src/speech/speech-port";

function clickPrimary(view: HTMLElement): Promise<void> {
  const button = view.querySelector<HTMLButtonElement>("button.primary-action");
  if (!button) throw new Error("primary action missing");
  button.click();
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function chooseFirst(view: HTMLElement): void {
  const input = view.querySelector<HTMLInputElement>('input[type="radio"]');
  if (!input) throw new Error("choice missing");
  input.click();
}

function speechFixture(): SpeechPort {
  const recording: RecordingSession = { stop: vi.fn(async () => new Blob(["voice"], { type: "audio/webm" })) };
  return {
    playFixed: vi.fn(async () => undefined),
    speak: vi.fn(async () => undefined),
    startRecording: vi.fn(async () => recording),
    recognize: vi.fn(async () => null),
    recognitionMode: vi.fn(async (): Promise<"self-rating"> => "self-rating")
  };
}

afterEach(() => document.body.replaceChildren());

describe("two-minute calibration", () => {
  it("contains exactly two recognition, two listening-intent, and two speaking items", () => {
    const view = renderCalibration({ speech: speechFixture(), store: { saveBaseline: vi.fn(), saveRecording: vi.fn() } });

    expect(calibrationItems.filter((item) => item.kind === "recognition")).toHaveLength(2);
    expect(calibrationItems.filter((item) => item.kind === "listening-intent")).toHaveLength(2);
    expect(calibrationItems.filter((item) => item.kind === "speaking")).toHaveLength(2);
    expect(view.textContent).not.toMatch(/CEFR|A1\s*分数/i);
  });

  it("saves both speaking recordings and labels the result only as a starting support level", async () => {
    let tick = 0;
    const store: CalibrationStore = { saveBaseline: vi.fn(async () => undefined), saveRecording: vi.fn(async () => undefined) };
    const view = renderCalibration({ speech: speechFixture(), store, now: () => (tick += 1_000) });
    document.body.append(view);

    await clickPrimary(view); // intro
    for (let index = 0; index < 4; index += 1) {
      chooseFirst(view);
      await clickPrimary(view);
    }
    for (let index = 0; index < 2; index += 1) {
      await clickPrimary(view); // start
      await clickPrimary(view); // stop
      const smooth = view.querySelector<HTMLInputElement>('input[value="smooth"]');
      expect(smooth).not.toBeNull();
      smooth!.click();
      await clickPrimary(view); // confirm
    }

    expect(store.saveRecording).toHaveBeenCalledTimes(2);
    expect(store.saveBaseline).toHaveBeenCalledWith(expect.objectContaining({
      supportLevel: expect.stringMatching(/^(full|english|partial|prompt-only)$/),
      speakingSeconds: 2
    }));
    expect(view.textContent).toContain("起始提示级别");
    expect(view.textContent).not.toMatch(/CEFR|正式等级|英语等级/);
  });

  it("keeps exactly one primary action on every visible step", async () => {
    const view = renderCalibration({ speech: speechFixture(), store: { saveBaseline: vi.fn(), saveRecording: vi.fn() } });
    document.body.append(view);
    expect(view.querySelectorAll("button.primary-action")).toHaveLength(1);
    await clickPrimary(view);
    expect(view.querySelectorAll("button.primary-action")).toHaveLength(1);
    chooseFirst(view);
    await clickPrimary(view);
    expect(view.querySelectorAll("button.primary-action")).toHaveLength(1);
  });
});
