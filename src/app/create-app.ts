import { createElement } from "../ui/dom";
import { allMissions } from "../content/catalog";
import { renderCalibration } from "../features/calibration/calibration-view";
import { renderEmergency, type LookupWord } from "../features/emergency/emergency-view";
import { renderHome } from "../features/home/home-view";
import { renderLesson, type LessonView } from "../features/lesson/lesson-view";
import { renderProgress, type ProgressView } from "../features/progress/progress-view";
import { SelectionController } from "../selection/selection-controller";
import type { SpeechPort } from "../speech/speech-port";
import type { ProgressRepository } from "../storage/progress-repository";
import { startRouter, type AppRoute } from "./router";

const destinations = [
  { href: "#/home", label: "首页" },
  { href: "#/emergency", label: "急救箱" },
  { href: "#/progress", label: "进度" }
] as const;

export function createAppShell(): HTMLElement {
  const shell = createElement("div", "app-shell");
  const outlet = createElement("main");
  outlet.id = "route-outlet";
  outlet.tabIndex = -1;

  const navigation = createElement("nav");
  navigation.setAttribute("aria-label", "主要导航");

  for (const destination of destinations) {
    const link = createElement("a");
    link.href = destination.href;
    link.textContent = destination.label;
    navigation.append(link);
  }

  shell.append(outlet, navigation);
  return shell;
}

export interface AppDependencies {
  repository: ProgressRepository;
  speech: SpeechPort;
  requestPersistence?: () => Promise<"granted" | "best-effort" | "unsupported">;
}

export interface TravelEnglishApp extends HTMLElement {
  dispose(): void;
}

const savedLookupKey = "trip-english-saved-lookups";

function saveLocally(values: readonly string[]): void {
  try {
    const previous = JSON.parse(localStorage.getItem(savedLookupKey) ?? "[]") as unknown;
    const stored = Array.isArray(previous)
      ? previous.filter((value): value is string => typeof value === "string")
      : [];
    localStorage.setItem(savedLookupKey, JSON.stringify([...new Set([...stored, ...values])]));
  } catch {
    throw new Error("local save failed");
  }
}

export function createApp(dependencies: AppDependencies): TravelEnglishApp {
  const shell = createAppShell() as TravelEnglishApp;
  const outlet = shell.querySelector<HTMLElement>("#route-outlet")!;
  let renderVersion = 0;
  let currentView: (HTMLElement & { dispose?: () => void | Promise<void> }) | undefined;
  let pendingLookup = "";

  const replaceView = (view: HTMLElement & { dispose?: () => void | Promise<void> }): void => {
    void currentView?.dispose?.();
    currentView = view;
    outlet.replaceChildren(view);
    view.querySelector<HTMLElement>("h1")?.focus();
  };

  const renderRoute = async (route: AppRoute): Promise<void> => {
    const version = ++renderVersion;
    outlet.setAttribute("aria-busy", "true");
    try {
      let view: HTMLElement & { dispose?: () => void | Promise<void> };
      if (route === "#/home") {
        const progress = await dependencies.repository.load();
        if (!progress.calibration) {
          view = renderCalibration({
            speech: dependencies.speech,
            store: dependencies.repository,
            onComplete: () => { void renderRoute("#/home"); }
          });
        } else {
          view = await renderHome({
            repository: dependencies.repository,
            onStartMission: (missionId) => { void showMission(missionId); }
          });
        }
      } else if (route === "#/emergency") {
        view = renderEmergency({
          speech: dependencies.speech,
          onSavePhrase: (phrase) => saveLocally([phrase.id]),
          onSaveLookup: (words: readonly LookupWord[]) => saveLocally(words.map((word) => word.word))
        });
        if (pendingLookup) {
          const input = view.querySelector<HTMLTextAreaElement>("[data-lookup-input]");
          if (input) {
            input.value = pendingLookup;
            input.dispatchEvent(new Event("input", { bubbles: true }));
          }
          pendingLookup = "";
        }
      } else {
        view = await renderProgress({
          repository: dependencies.repository,
          speech: dependencies.speech,
          ...(dependencies.requestPersistence ? { requestPersistence: dependencies.requestPersistence } : {})
        });
      }
      if (version !== renderVersion) {
        await view.dispose?.();
        return;
      }
      replaceView(view);
      shell.querySelectorAll("nav a").forEach((link) => {
        if (link.getAttribute("href") === route) link.setAttribute("aria-current", "page");
        else link.removeAttribute("aria-current");
      });
    } catch {
      if (version !== renderVersion) return;
      const error = document.createElement("section");
      const heading = document.createElement("h1");
      heading.textContent = "暂时打不开";
      const message = document.createElement("p");
      message.setAttribute("role", "alert");
      message.textContent = "本地数据读取失败，请刷新页面重试。";
      error.append(heading, message);
      replaceView(error);
    } finally {
      if (version === renderVersion) outlet.removeAttribute("aria-busy");
    }
  };

  const showMission = async (missionId: string): Promise<void> => {
    const mission = allMissions.find((candidate) => candidate.id === missionId);
    if (!mission) return;
    const version = ++renderVersion;
    outlet.setAttribute("aria-busy", "true");
    try {
      const progress = await dependencies.repository.load();
      if (version !== renderVersion) return;
      const lesson: LessonView = renderLesson({
        mission,
        progress,
        speech: dependencies.speech,
        persistence: dependencies.repository,
        onComplete: () => { window.location.hash = "#/home"; void renderRoute("#/home"); }
      });
      replaceView(lesson);
    } catch {
      if (version !== renderVersion) return;
      const error = document.createElement("p");
      error.setAttribute("role", "alert");
      error.textContent = "任务暂时无法打开，请返回首页重试。";
      replaceView(error);
    } finally {
      if (version === renderVersion) outlet.removeAttribute("aria-busy");
    }
  };

  const stopRouter = startRouter((route) => { void renderRoute(route); });
  const navigate = (event: Event): void => {
    const href = (event as CustomEvent<{ href?: string }>).detail?.href;
    if (href !== "#/home" && href !== "#/emergency" && href !== "#/progress") return;
    if (window.location.hash === href) void renderRoute(href);
    else window.location.hash = href;
  };
  shell.addEventListener("app:navigate", navigate);
  const selection = new SelectionController({
    speech: dependencies.speech,
    onLookup: (text) => {
      pendingLookup = text;
      if (window.location.hash === "#/emergency") void renderRoute("#/emergency");
      else window.location.hash = "#/emergency";
    },
    onSave: (text) => saveLocally([text])
  });
  shell.dispose = () => {
    renderVersion += 1;
    stopRouter();
    selection.destroy();
    shell.removeEventListener("app:navigate", navigate);
    void currentView?.dispose?.();
  };
  return shell;
}
