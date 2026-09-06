export interface RecordingSession {
  stop(): Promise<Blob>;
}

export interface RecognitionResult {
  transcript: string;
  confidence: number | null;
}

export interface SpeechPort {
  speak(text: string, rate: 1 | 0.75): Promise<void>;
  startRecording(): Promise<RecordingSession>;
  recognize(expectedLanguage: "en-US"): Promise<RecognitionResult | null>;
  recognitionMode(): Promise<"automatic" | "self-rating">;
}
