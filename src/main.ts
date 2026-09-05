import { createApp } from "./app/create-app";
import { BrowserSpeech } from "./speech/browser-speech";
import { IndexedDbProgressRepository } from "./storage/indexeddb-progress-repository";
import "./styles/tokens.css";
import "./styles/global.css";

document.body.replaceChildren(createApp({
  repository: new IndexedDbProgressRepository(),
  speech: new BrowserSpeech()
}));
