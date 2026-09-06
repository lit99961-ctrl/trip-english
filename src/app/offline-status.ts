import type { SpeechPort } from "../speech/speech-port";

const REQUIRED_GROUP_COUNT = 3;

export interface OfflineInputs {
  online: boolean;
  fixedAssetsReady: boolean;
  readyGroups?: number;
}

export interface OfflineState {
  lessonsAvailable: boolean;
  recognitionAvailable: boolean;
  label: string;
}

export function deriveOfflineState(input: OfflineInputs): OfflineState {
  if (!input.online && input.fixedAssetsReady) {
    return { lessonsAvailable: true, recognitionAvailable: false, label: "离线可学习" };
  }
  if (!input.online) {
    return { lessonsAvailable: false, recognitionAvailable: false, label: "首次使用需联网下载" };
  }
  if (input.fixedAssetsReady) {
    return { lessonsAvailable: true, recognitionAvailable: true, label: "离线内容已就绪" };
  }
  const readyGroups = Math.max(0, Math.min(REQUIRED_GROUP_COUNT, input.readyGroups ?? 0));
  return {
    lessonsAvailable: true,
    recognitionAvailable: true,
    label: `正在准备离线内容 ${readyGroups}/${REQUIRED_GROUP_COUNT}`
  };
}

interface ConnectivityEvents {
  addEventListener(type: "online" | "offline", listener: EventListener): void;
  removeEventListener(type: "online" | "offline", listener: EventListener): void;
}

export interface OfflineStatusController {
  setReadyGroups(count: number): void;
  markReady(): void;
  dispose(): void;
}

interface CacheReader {
  keys(): Promise<readonly string[]>;
  open(name: string): Promise<{ keys(): Promise<readonly Request[]> }>;
}

export async function countReadyOfflineGroups(
  storage: CacheReader,
  baseUrl = "/"
): Promise<number> {
  const base = baseUrl.startsWith("/") ? baseUrl : new URL(baseUrl, location.origin).pathname;
  const normalizedBase = base.endsWith("/") ? base : `${base}/`;
  const cacheNames = await storage.keys();
  const requests = (await Promise.all(cacheNames.map(async (name) => (await storage.open(name)).keys()))).flat();
  const paths = new Set(requests.map((request) => new URL(request.url).pathname));
  const hasIndex = paths.has(`${normalizedBase}index.html`);
  const hasStyle = [...paths].some((path) => path.startsWith(`${normalizedBase}assets/`) && path.endsWith(".css"));
  const hasApplicationBundle = [...paths].some((path) => path.startsWith(`${normalizedBase}assets/`) && path.endsWith(".js"));
  const audioCount = [...paths].filter((path) => path.startsWith(`${normalizedBase}audio/`) && path.endsWith(".aiff")).length;
  return Number(hasIndex && hasStyle) + Number(hasApplicationBundle) + Number(audioCount === 150);
}

export function mountOfflineStatus(
  target: HTMLElement,
  options: {
    events?: ConnectivityEvents;
    isOnline?: () => boolean;
    initiallyReady?: boolean;
  } = {}
): OfflineStatusController {
  const events = options.events ?? window;
  const isOnline = options.isOnline ?? (() => navigator.onLine);
  let fixedAssetsReady = options.initiallyReady ?? false;
  let readyGroups = fixedAssetsReady ? REQUIRED_GROUP_COUNT : 0;

  target.setAttribute("role", "status");
  target.setAttribute("aria-live", "polite");
  const render = (): void => {
    const state = deriveOfflineState({ online: isOnline(), fixedAssetsReady, readyGroups });
    target.textContent = state.label;
    target.dataset.lessonsAvailable = String(state.lessonsAvailable);
    target.dataset.recognitionAvailable = String(state.recognitionAvailable);
  };
  const connectivityChanged: EventListener = () => render();
  events.addEventListener("online", connectivityChanged);
  events.addEventListener("offline", connectivityChanged);
  render();

  return {
    setReadyGroups(count) {
      if (fixedAssetsReady) return;
      readyGroups = Math.max(0, Math.min(REQUIRED_GROUP_COUNT, Math.floor(count)));
      render();
    },
    markReady() {
      fixedAssetsReady = true;
      readyGroups = REQUIRED_GROUP_COUNT;
      render();
    },
    dispose() {
      events.removeEventListener("online", connectivityChanged);
      events.removeEventListener("offline", connectivityChanged);
    }
  };
}

export function createOfflineAwareSpeech(
  speech: SpeechPort,
  isOnline: () => boolean = () => navigator.onLine,
  baseUrl = import.meta.env.BASE_URL
): SpeechPort {
  return {
    playFixed: (src, rate) => speech.playFixed(resolveAppAssetPath(src, baseUrl), rate),
    speak: (text, rate) => speech.speak(text, rate),
    startRecording: () => speech.startRecording(),
    recognitionMode: () => isOnline() ? speech.recognitionMode() : Promise.resolve("self-rating"),
    recognize: (language) => isOnline() ? speech.recognize(language) : Promise.resolve(null)
  };
}

export function resolveAppAssetPath(source: string, baseUrl: string): string {
  if (!source.startsWith("/audio/")) return source;
  const normalizedBase = `/${baseUrl.split("/").filter(Boolean).join("/")}`;
  return `${normalizedBase === "/" ? "" : normalizedBase}${source}`;
}
