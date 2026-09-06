import { createApp } from "./app/create-app";
import { countReadyOfflineGroups, createOfflineAwareSpeech, mountOfflineStatus } from "./app/offline-status";
import { BrowserSpeech } from "./speech/browser-speech";
import { IndexedDbProgressRepository } from "./storage/indexeddb-progress-repository";
import { registerSW } from "virtual:pwa-register";
import "./styles/tokens.css";
import "./styles/global.css";

const speech = createOfflineAwareSpeech(new BrowserSpeech());
const app = createApp({
  repository: new IndexedDbProgressRepository(),
  speech
});
document.body.replaceChildren(app);

const statusTarget = app.querySelector<HTMLElement>("[data-offline-status]")!;
const offlineStatus = mountOfflineStatus(statusTarget);
registerSW({
  immediate: true,
  onRegisteredSW: (_scriptUrl, registration) => {
    offlineStatus.setReadyGroups(1);
    if (registration?.active && "caches" in window) {
      void countReadyOfflineGroups(caches, import.meta.env.BASE_URL).then((count) => {
        offlineStatus.setReadyGroups(count);
        if (count === 3) offlineStatus.markReady();
      }).catch(() => offlineStatus.setReadyGroups(0));
    }
  },
  onOfflineReady: () => offlineStatus.markReady(),
  onRegisterError: () => offlineStatus.setReadyGroups(0)
});
