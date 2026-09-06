import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createOfflineAwareSpeech,
  countReadyOfflineGroups,
  deriveOfflineState,
  mountOfflineStatus
} from "../../src/app/offline-status";
import type { SpeechPort } from "../../src/speech/speech-port";

afterEach(() => document.body.replaceChildren());

describe("offline readiness", () => {
  it("disables recognition without disabling downloaded lessons", () => {
    expect(deriveOfflineState({ online: false, fixedAssetsReady: true })).toEqual({
      lessonsAvailable: true,
      recognitionAvailable: false,
      label: "离线可学习"
    });
  });

  it("does not claim readiness before every required asset group succeeds", () => {
    expect(deriveOfflineState({ online: true, fixedAssetsReady: false, readyGroups: 2 })).toEqual({
      lessonsAvailable: true,
      recognitionAvailable: true,
      label: "正在准备离线内容 2/3"
    });
    expect(deriveOfflineState({ online: false, fixedAssetsReady: false })).toEqual({
      lessonsAvailable: false,
      recognitionAvailable: false,
      label: "首次使用需联网下载"
    });
  });

  it("updates an accessible status for download progress and connectivity", () => {
    const status = document.createElement("p");
    const listeners = new Map<string, EventListener>();
    const events = {
      addEventListener: vi.fn((type: string, listener: EventListener) => listeners.set(type, listener)),
      removeEventListener: vi.fn((type: string) => listeners.delete(type))
    };
    let online = true;
    const mounted = mountOfflineStatus(status, {
      events,
      isOnline: () => online,
      initiallyReady: false
    });
    mounted.setReadyGroups(2);
    expect(status.textContent).toBe("正在准备离线内容 2/3");
    mounted.markReady();
    expect(status.textContent).toBe("离线内容已就绪");
    online = false;
    listeners.get("offline")!(new Event("offline"));
    expect(status.textContent).toBe("离线可学习");
    mounted.dispose();
    expect(events.removeEventListener).toHaveBeenCalled();
  });

  it("falls back to self rating offline while retaining local speech features", async () => {
    const speech: SpeechPort = {
      playFixed: vi.fn(async () => undefined),
      speak: vi.fn(async () => undefined),
      startRecording: vi.fn(async () => ({ stop: async () => new Blob() })),
      recognize: vi.fn(async () => ({ transcript: "hello", confidence: 1 })),
      recognitionMode: vi.fn(async () => "automatic" as const)
    };
    const offline = createOfflineAwareSpeech(speech, () => false);

    expect(await offline.recognitionMode()).toBe("self-rating");
    await expect(offline.recognize("en-US")).resolves.toBeNull();
    await offline.playFixed("/audio/example.aiff", 1);
    expect(speech.playFixed).toHaveBeenCalled();
    expect(speech.recognize).not.toHaveBeenCalled();
  });

  it("only verifies readiness when shell, bundle, and all fixed audio are cached", async () => {
    const urls = [
      "https://example.test/app/index.html",
      "https://example.test/app/assets/index.css",
      "https://example.test/app/assets/index.js",
      ...Array.from({ length: 150 }, (_, index) => `https://example.test/app/audio/phrases/${index}.aiff`)
    ];
    const storage = {
      keys: async () => ["precache"],
      open: async () => ({ keys: async () => urls.map((url) => new Request(url)) })
    };
    await expect(countReadyOfflineGroups(storage, "/app/")).resolves.toBe(3);
    urls.pop();
    await expect(countReadyOfflineGroups(storage, "/app/")).resolves.toBe(2);
  });
});
