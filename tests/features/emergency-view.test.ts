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

  it("filters all 50 cards and speaks text at normal or slow speed", async () => {
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
    expect(audio.speak).toHaveBeenNthCalledWith(1, phrase.english, 1);
    expect(audio.speak).toHaveBeenNthCalledWith(2, phrase.english, 0.75);
  });

  it("gives repeated card controls a phrase-specific accessible name", () => {
    const view = renderEmergency({ speech: speech(), dictionary });
    const first = view.querySelector<HTMLElement>("[data-emergency-card]")!;
    const phrase = emergencyPhrases[0]!;
    expect(first.querySelector('button[data-rate="normal"]')?.getAttribute("aria-label"))
      .toBe(`正常播放：${phrase.english}`);
    expect(first.querySelectorAll("button[aria-label]")).toHaveLength(4);
  });

  it("reports favorite persistence failure truthfully and allows retry", async () => {
    const onSavePhrase = vi.fn()
      .mockRejectedValueOnce(new Error("quota"))
      .mockResolvedValueOnce(undefined);
    const view = renderEmergency({ speech: speech(), dictionary, onSavePhrase });
    document.body.append(view);
    const save = view.querySelector<HTMLButtonElement>("[data-emergency-card] [data-save-phrase]")!;
    save.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(view.textContent).toContain("收藏失败");
    expect(save.textContent).toBe("收藏");
    expect(save.disabled).toBe(false);

    save.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(save.textContent).toBe("已收藏");
    expect(onSavePhrase).toHaveBeenCalledTimes(2);
  });

  it("shows persisted favorites and reports lookup save failures", async () => {
    const onSaveLookup = vi.fn(async () => { throw new Error("quota"); });
    const view = renderEmergency({
      speech: speech(), dictionary, onSaveLookup,
      savedPhraseIds: [emergencyPhrases[0]!.id]
    });
    document.body.append(view);
    expect(view.querySelector<HTMLButtonElement>("[data-emergency-card] [data-save-phrase]")?.textContent).toBe("已收藏");
    const input = view.querySelector<HTMLTextAreaElement>("[data-lookup-input]")!;
    input.value = "train";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(view.querySelector<HTMLButtonElement>("[data-save-lookup]")!.textContent).toBe("收藏查词");
    view.querySelector<HTMLButtonElement>("[data-save-lookup]")!.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(view.textContent).toContain("查词保存失败");
    expect(view.querySelector<HTMLButtonElement>("[data-save-lookup]")!.disabled).toBe(false);
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
