import { createElement } from "../ui/dom";
import { allMissions } from "../content/catalog";
import { renderCalibration } from "../features/calibration/calibration-view";
import { lookupText, renderEmergency } from "../features/emergency/emergency-view";
import { renderHome } from "../features/home/home-view";
import { renderLesson } from "../features/lesson/lesson-view";
import { renderLearning } from "../features/learning/learning-view";
import { missionDestination, renderMissionEntry } from "../features/mission-entry/mission-entry-view";
import { renderProgress } from "../features/progress/progress-view";
import { renderSprint } from "../features/sprint/sprint-view";
import { renderReview } from "../features/review/review-view";
import { isDailyReviewSlot } from "../domain/daily-review";
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
  const offlineStatus = createElement("p", "offline-status");
  offlineStatus.dataset.offlineStatus = "";
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

  shell.append(offlineStatus, outlet, navigation);
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
    const heading = view.querySelector<HTMLElement>("h1");
    if (heading) heading.tabIndex = -1;
    queueMicrotask(() => {
      if (heading?.isConnected) heading.focus();
      else if (outlet.isConnected) outlet.focus();
    });
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
            onStartMission: (missionId) => { window.location.hash = `#/lesson/${missionId}`; },
            onStartSprint: () => { window.location.hash = "#/sprint"; },
            onStartReview: (slot) => { window.location.hash = `#/review/${slot}`; }
          });
        }
      } else if (route === "#/sprint") {
        view = await renderSprint({
          repository: dependencies.repository,
          onStartMission: (missionId, mode) => {
            window.location.hash = `#/sprint/${mode === "introduction" ? "learn" : "challenge"}/${missionId}`;
          },
          onStartReview: (slot) => { window.location.hash = `#/sprint/review/${slot}`; },
          onComplete: () => { window.location.hash = "#/home"; }
        });
      } else if (route === "#/emergency") {
        const progress = await dependencies.repository.load();
        view = renderEmergency({
          speech: dependencies.speech,
          savedPhraseIds: progress.savedPhraseIds,
          onSavePhrase: (phrase) => dependencies.repository.savePhraseId(phrase.id),
          onSaveLookup: (words, text) => dependencies.repository.saveLookup({
            text,
            knownWords: words.map((word) => word.normalized),
            savedAt: new Date().toISOString()
          })
        });
        if (pendingLookup) {
          const input = view.querySelector<HTMLTextAreaElement>("[data-lookup-input]");
          if (input) {
            input.value = pendingLookup;
            input.dispatchEvent(new Event("input", { bubbles: true }));
          }
          pendingLookup = "";
        }
      } else if (route.startsWith("#/review/") || route.startsWith("#/sprint/review/")) {
        const fromSprint = route.startsWith("#/sprint/review/");
        const slot = route.slice(fromSprint ? "#/sprint/review/".length : "#/review/".length);
        if (!isDailyReviewSlot(slot)) throw new Error("invalid review slot");
        const progress = await dependencies.repository.load();
        view = renderReview({
          slot, progress, repository: dependencies.repository, speech: dependencies.speech,
          onComplete: () => { window.location.hash = fromSprint ? "#/sprint" : "#/home"; }
        });
      } else if (route === "#/progress") {
        view = await renderProgress({
          repository: dependencies.repository,
          speech: dependencies.speech,
          ...(dependencies.requestPersistence ? { requestPersistence: dependencies.requestPersistence } : {})
        });
      } else {
        const match = route.match(/^#\/(sprint\/)?(lesson|learn|challenge)\/(.+)$/);
        const fromSprint = Boolean(match?.[1]);
        const routeKind = match?.[2] as "lesson" | "learn" | "challenge" | undefined;
        const missionId = match?.[3] ?? "";
        const mission = allMissions.find((candidate) => candidate.id === missionId);
        if (!mission) {
          const invalid = document.createElement("section");
          const invalidHeading = document.createElement("h1");
          invalidHeading.textContent = "任务不存在";
          const back = document.createElement("a");
          back.href = "#/home";
          back.textContent = "返回首页";
          invalid.append(invalidHeading, back);
          view = invalid;
        } else {
          const progress = await dependencies.repository.load();
          const prefix = fromSprint ? "#/sprint" : "";
          const destination = routeKind === "learn"
            ? "learning"
            : missionDestination(progress, mission, routeKind === "challenge");
          if (destination === "learning") {
            const isReview = routeKind === "learn" && missionDestination(progress, mission, false) === "entry";
            view = renderLearning({
              mission, progress, repository: dependencies.repository, speech: dependencies.speech,
              mode: isReview ? "review" : "introduction",
              backHref: fromSprint ? "#/sprint" : "#/home",
              onComplete: () => { window.location.hash = `${prefix}/challenge/${mission.id}`; }
            });
          } else if (destination === "entry") {
            view = renderMissionEntry({
              mission,
              onReview: () => { window.location.hash = `${prefix}/learn/${mission.id}`; },
              onChallenge: () => { window.location.hash = `${prefix}/challenge/${mission.id}`; }
            });
          } else {
            view = renderLesson({
              mission,
              progress,
              speech: dependencies.speech,
              persistence: dependencies.repository,
              onComplete: () => { window.location.hash = fromSprint ? "#/sprint" : "#/home"; }
            });
          }
        }
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
    onSave: async (text) => {
      const result = lookupText(text);
      if (result.words.length === 0) throw new Error("selected text has no known words");
      await dependencies.repository.saveLookup({
        text: result.normalizedText,
        knownWords: result.words.map((word) => word.normalized),
        savedAt: new Date().toISOString()
      });
    }
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
