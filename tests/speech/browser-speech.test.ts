import { describe, expect, it } from "vitest";
import { BrowserSpeech, SpeechCapabilityError } from "../../src/speech/browser-speech";

class Events {
  private readonly listeners = new Map<string, Set<(event: any) => void>>();
  addEventListener(type: string, listener: (event: any) => void) { (this.listeners.get(type) ?? this.listeners.set(type, new Set()).get(type)!).add(listener); }
  removeEventListener(type: string, listener: (event: any) => void) { this.listeners.get(type)?.delete(listener); }
  emit(type: string, event: any = {}) { this.listeners.get(type)?.forEach((listener) => listener(event)); }
  listenerCount(type: string) { return this.listeners.get(type)?.size ?? 0; }
}
class FakeAudio extends Events { playbackRate = 1; async play() {} }
class FakeUtterance extends Events { lang = ""; rate = 1; constructor(readonly text: string) { super(); } }
class FakeSynthesis { utterance: FakeUtterance | null = null; cancelled = false; cancel() { this.cancelled = true; } speak(utterance: FakeUtterance) { this.utterance = utterance; } }
class FakeTrack { stopped = false; stop() { this.stopped = true; } }
class FakeRecorder extends Events { state = "inactive"; mimeType = "audio/webm"; start() { this.state = "recording"; } stop() { this.state = "inactive"; this.emit("stop"); } }
class FakeRecognition extends Events { lang = ""; interimResults = true; maxAlternatives = 0; aborted = false; start() {} abort() { this.aborted = true; } }
class SyncErrorRecorder extends FakeRecorder { override start() { this.state = "recording"; this.emit("error"); } }
class EndedOnStartRecorder extends FakeRecorder { override start() { this.state = "recording"; this.emit("dataavailable", { data: new Blob(["ended"]) }); this.state = "inactive"; this.emit("stop"); } }
class TimeoutRaceRecognition extends FakeRecognition { override abort() { this.aborted = true; this.emit("error", { error: "network" }); this.emit("end"); } }
class AbortThrowingRecognition extends FakeRecognition { stopped = false; override abort() { throw new Error("abort failed"); } stop() { this.stopped = true; } }

describe("BrowserSpeech", () => {
  it("uses self-rating when recognition is unavailable", async () => {
    const speech = new BrowserSpeech({ speechSynthesis: { cancel() {}, speak() {} } });

    await expect(speech.recognitionMode()).resolves.toBe("self-rating");
  });

  it("uses automatic recognition when a constructor is available", async () => {
    await expect(new BrowserSpeech({ SpeechRecognition: FakeRecognition }).recognitionMode()).resolves.toBe("automatic");
  });

  it("plays fixed audio at its exact rate until ended and rejects media errors", async () => {
    const audio = new FakeAudio();
    const speech = new BrowserSpeech({ createAudio: () => audio });
    const playing = speech.playFixed("/delayed.mp3", 0.75);
    expect(audio.playbackRate).toBe(0.75);
    audio.emit("ended");
    await expect(playing).resolves.toBeUndefined();
    const failed = speech.playFixed("/delayed.mp3", 1);
    audio.emit("error");
    await expect(failed).rejects.toMatchObject({ code: "playback-failed" });
  });

  it("converts rejected audio playback into a typed failure and removes listeners", async () => {
    const audio = new FakeAudio();
    audio.play = () => Promise.reject(new Error("blocked"));
    const result = new BrowserSpeech({ createAudio: () => audio }).playFixed("/blocked.mp3", 1);

    await expect(result).rejects.toMatchObject({ code: "playback-failed" });
    expect(audio.listenerCount("ended")).toBe(0);
    expect(audio.listenerCount("error")).toBe(0);
  });

  it("speaks English at its exact rate and reports synthesis failure", async () => {
    const synthesis = new FakeSynthesis();
    const speech = new BrowserSpeech({ speechSynthesis: synthesis, SpeechSynthesisUtterance: FakeUtterance });
    const speaking = speech.speak("delayed", 0.75);
    expect(synthesis.cancelled).toBe(true);
    expect(synthesis.utterance).toMatchObject({ text: "delayed", lang: "en-US", rate: 0.75 });
    synthesis.utterance?.emit("end");
    await expect(speaking).resolves.toBeUndefined();
    const failed = speech.speak("delayed", 1);
    synthesis.utterance?.emit("error");
    await expect(failed).rejects.toMatchObject({ code: "synthesis-failed" });
    await expect(speech.speak(" ", 1)).rejects.toMatchObject({ code: "invalid-text" });
  });

  it("records chunks and cleans up every track with idempotent stop", async () => {
    const track = new FakeTrack();
    const recorder = new FakeRecorder();
    const speech = new BrowserSpeech({
      getUserMedia: async () => ({ getTracks: () => [track] }) as unknown as MediaStream,
      MediaRecorder: class { constructor() { return recorder; } } as unknown as typeof MediaRecorder
    });
    const session = await speech.startRecording();
    recorder.emit("dataavailable", { data: new Blob(["voice"]) });
    const first = session.stop();
    const second = session.stop();
    await expect(first).resolves.toMatchObject({ type: "audio/webm", size: 5 });
    await expect(second).resolves.toBe(await first);
    expect(track.stopped).toBe(true);
  });

  it("classifies recording permission denial", async () => {
    const denied = Object.assign(new Error("no"), { name: "NotAllowedError" });
    await expect(new BrowserSpeech({ getUserMedia: async () => Promise.reject(denied), MediaRecorder: FakeRecorder }).startRecording()).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("reports recorder errors and cleans up its tracks", async () => {
    const track = new FakeTrack();
    const recorder = new FakeRecorder();
    const speech = new BrowserSpeech({
      getUserMedia: async () => ({ getTracks: () => [track] }) as unknown as MediaStream,
      MediaRecorder: class { constructor() { return recorder; } } as unknown as typeof MediaRecorder
    });
    const session = await speech.startRecording();
    recorder.emit("error");

    await expect(session.stop()).rejects.toMatchObject({ code: "recording-failed" });
    expect(track.stopped).toBe(true);
  });

  it("returns the stored blob when recording ends before the caller stops it", async () => {
    const track = new FakeTrack();
    const recorder = new EndedOnStartRecorder();
    const speech = new BrowserSpeech({
      getUserMedia: async () => ({ getTracks: () => [track] }) as unknown as MediaStream,
      MediaRecorder: class { constructor() { return recorder; } } as unknown as typeof MediaRecorder
    });
    const session = await speech.startRecording();
    const first = session.stop(); const second = session.stop();

    expect(second).toBe(first);
    await expect(first).resolves.toMatchObject({ type: "audio/webm", size: 5 });
    expect(track.stopped).toBe(true);
  });

  it("rejects a recorder that emits an error synchronously from start", async () => {
    const track = new FakeTrack();
    const recorder = new SyncErrorRecorder();
    const speech = new BrowserSpeech({
      getUserMedia: async () => ({ getTracks: () => [track] }) as unknown as MediaStream,
      MediaRecorder: class { constructor() { return recorder; } } as unknown as typeof MediaRecorder
    });

    await expect(speech.startRecording()).rejects.toMatchObject({ code: "recording-failed" });
    expect(track.stopped).toBe(true);
    expect(recorder.listenerCount("error")).toBe(0);
  });

  it("returns normalized recognition and resolves no speech as null", async () => {
    const recognition = new FakeRecognition();
    const speech = new BrowserSpeech({ SpeechRecognition: class { constructor() { return recognition; } } as unknown as typeof FakeRecognition });
    const result = speech.recognize("en-US");
    recognition.emit("result", { results: [[{ transcript: " delayed ", confidence: 0.8 }]] });
    await expect(result).resolves.toEqual({ transcript: "delayed", confidence: 0.8 });
    expect(recognition).toMatchObject({ lang: "en-US", interimResults: false, maxAlternatives: 1 });
    const none = speech.recognize("en-US");
    recognition.emit("error", { error: "no-speech" });
    await expect(none).resolves.toBeNull();
  });

  it.each([["not-allowed", "permission-denied"], ["network", "network"]] as const)("surfaces %s recognition errors", async (error, code) => {
    const recognition = new FakeRecognition();
    const speech = new BrowserSpeech({ SpeechRecognition: class { constructor() { return recognition; } } as unknown as typeof FakeRecognition });
    const result = speech.recognize("en-US");
    recognition.emit("error", { error });
    await expect(result).rejects.toBeInstanceOf(SpeechCapabilityError);
    await expect(result).rejects.toMatchObject({ code });
  });

  it("converts recognition construction and configuration failures", async () => {
    const construction = new BrowserSpeech({ SpeechRecognition: class { constructor() { throw new Error("no constructor"); } } as unknown as typeof FakeRecognition });
    class ConfigFailingRecognition extends Events {
      get lang() { return ""; }
      set lang(value: string) { throw new Error(value); }
      interimResults = false;
      maxAlternatives = 0;
      start() {}
    }
    const configured = new BrowserSpeech({ SpeechRecognition: ConfigFailingRecognition as unknown as typeof FakeRecognition });

    await expect(construction.recognize("en-US")).rejects.toMatchObject({ code: "recognition-failed" });
    await expect(configured.recognize("en-US")).rejects.toMatchObject({ code: "recognition-failed" });
  });

  it("aborts and fails timed-out recognition", async () => {
    const recognition = new FakeRecognition();
    let timer: (() => void) | undefined;
    const speech = new BrowserSpeech({
      SpeechRecognition: class { constructor() { return recognition; } } as unknown as typeof FakeRecognition,
      recognitionTimeoutMs: 1,
      setTimeout: (handler) => { timer = handler; return 1 as unknown as ReturnType<typeof setTimeout>; },
      clearTimeout: () => undefined
    });
    const result = speech.recognize("en-US");
    timer?.();
    await expect(result).rejects.toMatchObject({ code: "timeout" });
    expect(recognition.aborted).toBe(true);
  });

  it("settles timeout before abort-triggered recognition events", async () => {
    const recognition = new TimeoutRaceRecognition();
    let timer: (() => void) | undefined;
    const speech = new BrowserSpeech({
      SpeechRecognition: class { constructor() { return recognition; } } as unknown as typeof FakeRecognition,
      setTimeout: (handler) => { timer = handler; return 1 as unknown as ReturnType<typeof setTimeout>; },
      clearTimeout: () => undefined
    });
    const result = speech.recognize("en-US");
    timer?.();

    await expect(result).rejects.toMatchObject({ code: "timeout" });
    expect(recognition.listenerCount("error")).toBe(0);
  });

  it("still tries to stop recognition when abort throws during timeout", async () => {
    const recognition = new AbortThrowingRecognition(); let timer: (() => void) | undefined;
    const speech = new BrowserSpeech({
      SpeechRecognition: class { constructor() { return recognition; } } as unknown as typeof FakeRecognition,
      setTimeout: (handler) => { timer = handler; return 1 as unknown as ReturnType<typeof setTimeout>; }, clearTimeout: () => undefined
    });
    const result = speech.recognize("en-US"); timer?.();

    await expect(result).rejects.toMatchObject({ code: "timeout" });
    expect(recognition.stopped).toBe(true);
  });
});
