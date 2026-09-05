import type { RecognitionResult, RecordingSession, SpeechPort } from "./speech-port";

export type SpeechFailureCode =
  | "unsupported"
  | "invalid-text"
  | "playback-failed"
  | "synthesis-failed"
  | "cancelled"
  | "permission-denied"
  | "recording-failed"
  | "network"
  | "recognition-failed"
  | "timeout";

export class SpeechCapabilityError extends Error {
  constructor(readonly code: SpeechFailureCode, message: string = code) {
    super(message);
    this.name = "SpeechCapabilityError";
  }
}

type EventListener = (event: any) => void;
interface EventSource {
  addEventListener(type: string, listener: EventListener): void;
  removeEventListener(type: string, listener: EventListener): void;
}
interface AudioSource extends EventSource {
  playbackRate: number;
  play(): Promise<void>;
}
interface Synthesis {
  cancel(): void;
  speak(utterance: Utterance): void;
}
interface ActiveUtterance {
  cancel(): void;
}
const activeUtterances = new WeakMap<Synthesis, ActiveUtterance>();
interface Utterance extends EventSource {
  lang: string;
  rate: number;
}
interface Recorder extends EventSource {
  readonly state: string;
  readonly mimeType?: string;
  start(): void;
  stop(): void;
}
interface Recognition extends EventSource {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  abort?(): void;
  stop?(): void;
}
type Ctor<T> = new (...args: any[]) => T;

export interface BrowserSpeechDependencies {
  createAudio?: ((src: string) => AudioSource) | undefined;
  speechSynthesis?: Synthesis | undefined;
  SpeechSynthesisUtterance?: Ctor<Utterance> | undefined;
  getUserMedia?: ((constraints: MediaStreamConstraints) => Promise<MediaStream>) | undefined;
  MediaRecorder?: Ctor<Recorder> | undefined;
  SpeechRecognition?: Ctor<Recognition> | undefined;
  recognitionTimeoutMs?: number | undefined;
  setTimeout?: ((handler: () => void, timeout: number) => ReturnType<typeof setTimeout>) | undefined;
  clearTimeout?: ((timer: ReturnType<typeof setTimeout>) => void) | undefined;
}

function browserDefaults(): BrowserSpeechDependencies {
  const browserWindow = typeof window === "undefined" ? undefined : window as Window & {
    webkitSpeechRecognition?: Ctor<Recognition>;
    SpeechRecognition?: Ctor<Recognition>;
    SpeechSynthesisUtterance?: Ctor<Utterance>;
  };
  const browserNavigator = typeof navigator === "undefined" ? undefined : navigator;
  return {
    createAudio: typeof Audio === "undefined" ? undefined : (src) => new Audio(src) as unknown as AudioSource,
    speechSynthesis: browserWindow?.speechSynthesis as unknown as Synthesis | undefined,
    SpeechSynthesisUtterance: browserWindow?.SpeechSynthesisUtterance as unknown as Ctor<Utterance> | undefined,
    getUserMedia: browserNavigator?.mediaDevices?.getUserMedia?.bind(browserNavigator.mediaDevices),
    MediaRecorder: typeof MediaRecorder === "undefined" ? undefined : MediaRecorder as unknown as Ctor<Recorder>,
    SpeechRecognition: browserWindow?.SpeechRecognition ?? browserWindow?.webkitSpeechRecognition
  };
}

function capabilityError(code: SpeechFailureCode, message?: string): SpeechCapabilityError {
  return new SpeechCapabilityError(code, message);
}

function isPermissionError(error: unknown): boolean {
  const name = error instanceof Error ? error.name : "";
  return name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError";
}

function validRate(rate: 1 | 0.75): boolean {
  return rate === 1 || rate === 0.75;
}

export class BrowserSpeech implements SpeechPort {
  private readonly dependencies: BrowserSpeechDependencies;

  constructor(dependencies: BrowserSpeechDependencies = {}) {
    this.dependencies = { ...browserDefaults(), ...dependencies };
  }

  async recognitionMode(): Promise<"automatic" | "self-rating"> {
    return this.dependencies.SpeechRecognition ? "automatic" : "self-rating";
  }

  async playFixed(src: string, rate: 1 | 0.75): Promise<void> {
    if (!src.trim() || !validRate(rate)) throw capabilityError("playback-failed", "A valid audio source and rate are required.");
    const factory = this.dependencies.createAudio;
    if (!factory) throw capabilityError("unsupported", "Audio playback is unavailable.");
    const audio = factory(src);
    audio.playbackRate = rate;
    return new Promise<void>((resolve, reject) => {
      const finish = (error?: SpeechCapabilityError) => {
        audio.removeEventListener("ended", ended);
        audio.removeEventListener("error", failed);
        error ? reject(error) : resolve();
      };
      const ended = () => finish();
      const failed = () => finish(capabilityError("playback-failed", "Audio playback failed."));
      audio.addEventListener("ended", ended);
      audio.addEventListener("error", failed);
      void audio.play().catch(() => failed());
    });
  }

  async speak(text: string, rate: 1 | 0.75): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed) throw capabilityError("invalid-text", "Text to speak cannot be empty.");
    if (!validRate(rate)) throw capabilityError("synthesis-failed", "Unsupported speech rate.");
    const synthesis = this.dependencies.speechSynthesis;
    const UtteranceConstructor = this.dependencies.SpeechSynthesisUtterance;
    if (!synthesis || !UtteranceConstructor) throw capabilityError("unsupported", "Speech synthesis is unavailable.");
    const utterance = new UtteranceConstructor(trimmed);
    utterance.lang = "en-US";
    utterance.rate = rate;
    const previous = activeUtterances.get(synthesis);
    return new Promise<void>((resolve, reject) => {
      let active: ActiveUtterance;
      const finish = (error?: SpeechCapabilityError) => {
        utterance.removeEventListener("end", ended);
        utterance.removeEventListener("error", failed);
        if (activeUtterances.get(synthesis) === active) activeUtterances.delete(synthesis);
        error ? reject(error) : resolve();
      };
      const ended = () => finish();
      const failed = () => finish(capabilityError("synthesis-failed", "Speech synthesis failed."));
      active = { cancel: () => finish(capabilityError("cancelled", "Speech was replaced by a newer request.")) };
      previous?.cancel();
      activeUtterances.set(synthesis, active);
      utterance.addEventListener("end", ended);
      utterance.addEventListener("error", failed);
      try {
        synthesis.cancel();
        synthesis.speak(utterance);
      } catch {
        failed();
      }
    });
  }

  async startRecording(): Promise<RecordingSession> {
    const getUserMedia = this.dependencies.getUserMedia;
    const RecorderConstructor = this.dependencies.MediaRecorder;
    if (!getUserMedia || !RecorderConstructor) throw capabilityError("unsupported", "Recording is unavailable.");
    let stream: MediaStream;
    try {
      stream = await getUserMedia({ audio: true });
    } catch (error) {
      throw capabilityError(isPermissionError(error) ? "permission-denied" : "recording-failed", "Could not access the microphone.");
    }
    let recorder: Recorder;
    try {
      recorder = new RecorderConstructor(stream);
    } catch {
      stream.getTracks().forEach((track) => track.stop());
      throw capabilityError("recording-failed", "Could not create a recorder.");
    }
    const chunks: BlobPart[] = [];
    let settled = false;
    let stopRequested = false;
    let terminalError: SpeechCapabilityError | null = null;
    let resolveOutcome: (blob: Blob) => void = () => undefined;
    let rejectOutcome: (error: SpeechCapabilityError) => void = () => undefined;
    const outcome = new Promise<Blob>((resolve, reject) => {
      resolveOutcome = resolve;
      rejectOutcome = reject;
    });
    void outcome.catch(() => undefined);
    const stopTracks = () => stream.getTracks().forEach((track) => track.stop());
    const cleanup = () => {
      recorder.removeEventListener("dataavailable", data);
      recorder.removeEventListener("stop", complete);
      recorder.removeEventListener("error", failure);
    };
    const data = (event: { data?: Blob }) => {
      if (event.data && event.data.size > 0) chunks.push(event.data);
    };
    const complete = () => {
      if (settled) return;
      settled = true;
      cleanup();
      stopTracks();
      resolveOutcome(new Blob(chunks, recorder.mimeType ? { type: recorder.mimeType } : undefined));
    };
    const failure = () => {
      if (settled) return;
      settled = true;
      cleanup();
      stopTracks();
      terminalError = capabilityError("recording-failed", "Recording failed.");
      rejectOutcome(terminalError);
    };
    recorder.addEventListener("dataavailable", data);
    recorder.addEventListener("stop", complete);
    recorder.addEventListener("error", failure);
    try {
      recorder.start();
    } catch {
      failure();
    }
    if (terminalError) throw terminalError;
    return {
      stop: () => {
        if (!settled && !stopRequested) {
          stopRequested = true;
          if (recorder.state === "inactive") complete();
          else {
            try { recorder.stop(); } catch { failure(); }
          }
        }
        return outcome;
      }
    };
  }

  async recognize(expectedLanguage: "en-US"): Promise<RecognitionResult | null> {
    const RecognitionConstructor = this.dependencies.SpeechRecognition;
    if (!RecognitionConstructor) throw capabilityError("unsupported", "Automatic recognition is unavailable.");
    let recognition: Recognition;
    try {
      recognition = new RecognitionConstructor();
      recognition.lang = expectedLanguage;
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
    } catch {
      throw capabilityError("recognition-failed", "Speech recognition could not be configured.");
    }
    const timeoutMs = this.dependencies.recognitionTimeoutMs ?? 10_000;
    const later = this.dependencies.setTimeout ?? ((handler, timeout) => setTimeout(handler, timeout));
    const cancelLater = this.dependencies.clearTimeout ?? ((timer) => clearTimeout(timer));
    return new Promise<RecognitionResult | null>((resolve, reject) => {
      let done = false;
      let timer: ReturnType<typeof setTimeout> | null = null;
      const clean = () => {
        recognition.removeEventListener("result", result);
        recognition.removeEventListener("error", error);
        recognition.removeEventListener("end", ended);
        if (timer !== null) cancelLater(timer);
      };
      const finish = (value: RecognitionResult | null, failure?: SpeechCapabilityError) => {
        if (done) return;
        done = true;
        clean();
        failure ? reject(failure) : resolve(value);
      };
      const result = (event: { resultIndex?: number; results?: ArrayLike<ArrayLike<{ transcript?: string; confidence?: number }>> }) => {
        const index = typeof event.resultIndex === "number" && Number.isInteger(event.resultIndex) && event.resultIndex >= 0 ? event.resultIndex : 0;
        const alternative = event.results?.[index]?.[0];
        const transcript = alternative?.transcript?.trim() ?? "";
        if (!transcript) return finish(null);
        const confidence = alternative?.confidence;
        finish({ transcript, confidence: typeof confidence === "number" && Number.isFinite(confidence) && confidence >= 0 && confidence <= 1 ? confidence : null });
      };
      const error = (event: { error?: string }) => {
        if (event.error === "no-speech") return finish(null);
        if (event.error === "not-allowed" || event.error === "service-not-allowed") return finish(null, capabilityError("permission-denied", "Speech recognition permission was denied."));
        if (event.error === "network") return finish(null, capabilityError("network", "Speech recognition network failed."));
        return finish(null, capabilityError("recognition-failed", "Speech recognition failed."));
      };
      const ended = () => finish(null);
      recognition.addEventListener("result", result);
      recognition.addEventListener("error", error);
      recognition.addEventListener("end", ended);
      timer = later(() => {
        finish(null, capabilityError("timeout", "Speech recognition timed out."));
        try { recognition.abort?.(); } catch { /* browser implementations vary */ }
        try { recognition.stop?.(); } catch { /* browser implementations vary */ }
      }, timeoutMs);
      if (done && timer !== null) cancelLater(timer);
      try { recognition.start(); } catch { finish(null, capabilityError("recognition-failed", "Speech recognition could not start.")); }
    });
  }
}
