import { afterEach, describe, expect, it, vi } from "vitest";
import { emergencyPhrases } from "../../src/content/emergency-phrases";
import {
  lookupText,
  renderEmergency,
  type DictionaryEntry
} from "../../src/features/emergency/emergency-view";
import type { SpeechPort } from "../../src/speech/speech-port";

const dictionary: readonly DictionaryEntry[] = [
  { word: "the", phonetic: "/ðə/", chinese: "这；该", tags: [] },
  { word: "train", phonetic: "/treɪn/", chinese: "火车", tags: [] },
  { word: "is", phonetic: "/ɪz/", chinese: "是", tags: [] },
  { word: "delayed", phonetic: "/dɪˈleɪd/", chinese: "延误的", tags: [] }
];

function speech(): SpeechPort {
  return {
    playFixed: vi.fn(async () => undefined),
    speak: vi.fn(async () => undefined),
    startRecording: vi.fn(),
    recognize: vi.fn(),
    recognitionMode: vi.fn(async () => "self-rating" as const)
  };
}

afterEach(() => document.body.replaceChildren());

describe("emergency kit and light lookup", () => {
  it("explains known words but never pretends to translate arbitrary text", () => {
    const result = lookupText("  The train is delayed!  ", dictionary);
    expect(result.words.map((word) => word.normalized)).toEqual(["the", "train", "is", "delayed"]);
    expect(result.sentenceTranslation).toBeUndefined();
    expect(result.canCopyForSystemTranslation).toBe(true);
  });

  it("filters all 50 cards and plays fixed audio at normal or slow speed", async () => {
    const audio = speech();
    const view = renderEmergency({ speech: audio, dictionary });
    document.body.append(view);
    expect(view.querySelectorAll("[data-emergency-card]")).toHaveLength(50);

    const search = view.querySelector<HTMLInputElement>('input[type="search"]')!;
    search.value = "ambulance";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    expect(view.querySelectorAll("[data-emergency-card]")).toHaveLength(1);
    const buttons = view.querySelectorAll<HTMLButtonElement>("[data-emergency-card] button[data-rate]");
    buttons[0]!.click();
    buttons[1]!.click();
    await Promise.resolve();
    const phrase = emergencyPhrases.find((item) => item.english.includes("ambulance"))!;
    expect(audio.playFixed).toHaveBeenNthCalledWith(1, phrase.audio, 1);
    expect(audio.playFixed).toHaveBeenNthCalledWith(2, phrase.audio, 0.75);
  });

  it("gives repeated card controls a phrase-specific accessible name", () => {
    const view = renderEmergency({ speech: speech(), dictionary });
    const first = view.querySelector<HTMLElement>("[data-emergency-card]")!;
    const phrase = emergencyPhrases[0]!;
    expect(first.querySelector('button[data-rate="normal"]')?.getAttribute("aria-label"))
      .toBe(`正常播放：${phrase.english}`);
    expect(first.querySelectorAll("button[aria-label]")).toHaveLength(4);
  });

  it("keeps denied clipboard text editable and gives an explicit system-translation path", async () => {
    const clipboard = { writeText: vi.fn(async () => { throw new Error("denied"); }) };
    const view = renderEmergency({ speech: speech(), dictionary, clipboard });
    document.body.append(view);
    const input = view.querySelector<HTMLTextAreaElement>("[data-lookup-input]")!;
    input.value = "mystery sentence";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    view.querySelector<HTMLButtonElement>("[data-copy-system-translation]")!.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(input.value).toBe("mystery sentence");
    expect(input.disabled).toBe(false);
    expect(view.textContent).toContain("复制失败");
    expect(view.textContent).toContain("系统翻译");
    expect(view.textContent).not.toContain("整句翻译：");
  });
});
