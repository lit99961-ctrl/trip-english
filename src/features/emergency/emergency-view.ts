import dictionarySource from "../../content/dictionary.generated.json";
import {
  emergencyCategories,
  emergencyPhrases,
  type EmergencyCategory,
  type EmergencyPhrase
} from "../../content/emergency-phrases";
import type { SpeechPort } from "../../speech/speech-port";

export interface DictionaryEntry {
  readonly word: string;
  readonly phonetic: string | null;
  readonly chinese: string;
  readonly tags: readonly string[];
}

export interface LookupWord extends DictionaryEntry {
  readonly normalized: string;
}

export interface LookupResult {
  readonly normalizedText: string;
  readonly words: readonly LookupWord[];
  readonly unknownTokens: readonly string[];
  readonly canCopyForSystemTranslation: boolean;
  readonly sentenceTranslation?: never;
}

export interface EmergencyViewOptions {
  speech: Pick<SpeechPort, "speak">;
  dictionary?: readonly DictionaryEntry[];
  clipboard?: Pick<Clipboard, "writeText">;
  savedPhraseIds?: readonly string[];
  onSavePhrase?: (phrase: EmergencyPhrase) => unknown | Promise<unknown>;
  onSaveLookup?: (words: readonly LookupWord[], text: string) => unknown | Promise<unknown>;
}

const categoryLabels: Record<EmergencyCategory, string> = {
  airport: "机场", hotel: "酒店", transport: "火车交通", restaurant: "餐厅",
  shopping: "购物", medical: "医疗", "general-help": "通用求助"
};

export function normalizeLookupText(text: string): string {
  return text.normalize("NFKC").replace(/[’‘]/g, "'").trim();
}

function lookupTokens(text: string): string[] {
  return text.toLocaleLowerCase("en-US").match(/[a-z]+(?:'[a-z]+)?/g) ?? [];
}

export function lookupText(
  text: string,
  dictionary: readonly DictionaryEntry[] = dictionarySource
): LookupResult {
  const normalizedText = normalizeLookupText(text);
  const tokens = lookupTokens(normalizedText);
  const byWord = new Map(dictionary.map((entry) => [entry.word.toLocaleLowerCase("en-US"), entry]));
  const words: LookupWord[] = [];
  const unknownTokens: string[] = [];
  for (const normalized of tokens) {
    const entry = byWord.get(normalized);
    if (entry) words.push({ ...entry, normalized });
    else unknownTokens.push(normalized);
  }
  return {
    normalizedText,
    words,
    unknownTokens,
    canCopyForSystemTranslation: tokens.length > 1 || unknownTokens.length > 0
  };
}

export function renderEmergency(options: EmergencyViewOptions): HTMLElement {
  const root = document.createElement("section");
  root.className = "emergency-view stack";
  const heading = document.createElement("h1");
  heading.textContent = "救命句卡";
  const intro = document.createElement("p");
  intro.textContent = "离线也能打开、播放和给对方看。";
  const search = document.createElement("input");
  search.type = "search";
  search.placeholder = "搜场景、中文或英文";
  search.setAttribute("aria-label", "搜索救命句");
  const categories = document.createElement("select");
  categories.setAttribute("aria-label", "按场景筛选");
  categories.append(new Option("全部场景", "all"));
  emergencyCategories.forEach((category) => categories.append(new Option(categoryLabels[category], category)));
  const cards = document.createElement("div");
  cards.className = "card-list";
  const status = document.createElement("p");
  status.setAttribute("role", "status");
  const savedPhraseIds = new Set(options.savedPhraseIds ?? []);

  const report = (message: string, error = false): void => {
    status.textContent = message;
    status.setAttribute("role", error ? "alert" : "status");
  };
  const invoke = (work: () => Promise<unknown> | unknown, success: string): void => {
    try {
      void Promise.resolve(work()).then(() => report(success)).catch(() => report("操作失败，请重试。", true));
    } catch {
      report("操作失败，请重试。", true);
    }
  };
  const copy = (text: string): void => {
    const clipboard = options.clipboard ?? navigator.clipboard;
    if (!clipboard) return report("复制失败，请长按文字手动复制。", true);
    try {
      void Promise.resolve(clipboard.writeText(text))
        .then(() => report("已复制。可以切换到需要的应用。"))
        .catch(() => report("复制失败，文字仍保留，可长按手动复制。", true));
    } catch {
      report("复制失败，文字仍保留，可长按手动复制。", true);
    }
  };
  const button = (label: string, action: () => void): HTMLButtonElement => {
    const result = document.createElement("button");
    result.type = "button";
    result.textContent = label;
    result.addEventListener("click", action);
    return result;
  };

  const renderCards = (): void => {
    const query = search.value.trim().toLocaleLowerCase("en-US");
    const category = categories.value;
    const visible = emergencyPhrases.filter((phrase) => {
      if (category !== "all" && phrase.category !== category) return false;
      if (!query) return true;
      return [phrase.english, phrase.chinese, ...phrase.keywords]
        .some((value) => value.toLocaleLowerCase("en-US").includes(query));
    });
    cards.replaceChildren();
    visible.forEach((phrase) => {
      const card = document.createElement("article");
      card.className = "phrase-card";
      card.dataset.emergencyCard = phrase.id;
      const english = document.createElement("p");
      english.className = "english-phrase";
      english.dataset.english = "";
      english.textContent = phrase.english;
      const chinese = document.createElement("p");
      chinese.textContent = phrase.chinese;
      const actions = document.createElement("div");
      actions.className = "compact-actions";
      const normal = button("播放", () => invoke(() => options.speech.speak(phrase.english, 1), "播放完成。"));
      normal.dataset.rate = "normal";
      normal.setAttribute("aria-label", `正常播放：${phrase.english}`);
      const slow = button("慢速", () => invoke(() => options.speech.speak(phrase.english, 0.75), "播放完成。"));
      slow.dataset.rate = "slow";
      slow.setAttribute("aria-label", `慢速播放：${phrase.english}`);
      const copyButton = button("复制", () => copy(phrase.english));
      copyButton.setAttribute("aria-label", `复制：${phrase.english}`);
      const saveButton = button(savedPhraseIds.has(phrase.id) ? "已收藏" : "收藏", () => {
        if (!options.onSavePhrase || savedPhraseIds.has(phrase.id)) return;
        saveButton.disabled = true;
        try {
          void Promise.resolve(options.onSavePhrase(phrase)).then(() => {
            savedPhraseIds.add(phrase.id);
            saveButton.textContent = "已收藏";
            report("已收藏，并会包含在进度备份中。");
          }).catch(() => report("收藏失败，请重试。", true)).finally(() => {
            saveButton.disabled = savedPhraseIds.has(phrase.id);
          });
        } catch {
          saveButton.disabled = false;
          report("收藏失败，请重试。", true);
        }
      });
      saveButton.dataset.savePhrase = "";
      saveButton.disabled = savedPhraseIds.has(phrase.id);
      saveButton.setAttribute("aria-label", `收藏：${phrase.english}`);
      actions.append(
        normal,
        slow,
        copyButton,
        saveButton
      );
      card.append(english, chinese, actions);
      cards.append(card);
    });
    if (visible.length === 0) cards.textContent = "没有匹配的句卡，请换个词。";
  };
  search.addEventListener("input", renderCards);
  categories.addEventListener("change", renderCards);

  const lookup = document.createElement("section");
  lookup.className = "lookup-panel";
  const lookupHeading = document.createElement("h2");
  lookupHeading.textContent = "随手查英文";
  const lookupHelp = document.createElement("p");
  lookupHelp.textContent = "粘贴看到的英文，只逐词解释，不冒充整句翻译。";
  const lookupInput = document.createElement("textarea");
  lookupInput.dataset.lookupInput = "";
  lookupInput.rows = 3;
  lookupInput.placeholder = "粘贴英文，例如：The train is delayed";
  lookupInput.setAttribute("aria-label", "要查询的英文");
  const lookupResult = document.createElement("div");
  lookupResult.setAttribute("aria-live", "polite");

  const renderLookup = (): void => {
    const result = lookupText(lookupInput.value, options.dictionary ?? dictionarySource);
    lookupResult.replaceChildren();
    if (!result.normalizedText) return;
    result.words.forEach((word) => {
      const row = document.createElement("p");
      row.dataset.lookupWord = word.normalized;
      row.textContent = `${word.word}${word.phonetic ? ` ${word.phonetic}` : ""} — ${word.chinese}`;
      lookupResult.append(row);
    });
    if (result.unknownTokens.length > 0) {
      const unknown = document.createElement("p");
      unknown.textContent = `词典未收录：${[...new Set(result.unknownTokens)].join("、")}`;
      lookupResult.append(unknown);
    }
    const actions = document.createElement("div");
    actions.className = "compact-actions";
    actions.append(
      button("朗读", () => invoke(() => options.speech.speak(result.normalizedText, 1), "朗读完成。")),
      button("慢速", () => invoke(() => options.speech.speak(result.normalizedText, 0.75), "朗读完成。"))
    );
    if (result.words.length > 0) {
      const saveLookup = button("收藏查词", () => {
        if (!options.onSaveLookup) return;
        saveLookup.disabled = true;
        try {
          void Promise.resolve(options.onSaveLookup(result.words, result.normalizedText))
            .then(() => report("查词已收藏，并会包含在进度备份中。"))
            .catch(() => report("查词保存失败，请重试。", true))
            .finally(() => { saveLookup.disabled = false; });
        } catch {
          saveLookup.disabled = false;
          report("查词保存失败，请重试。", true);
        }
      });
      saveLookup.dataset.saveLookup = "";
      actions.append(saveLookup);
    }
    if (result.canCopyForSystemTranslation) {
      const system = button("复制到系统翻译", () => copy(result.normalizedText));
      system.dataset.copySystemTranslation = "";
      actions.append(system);
    }
    lookupResult.append(actions);
  };
  lookupInput.addEventListener("input", renderLookup);
  lookup.append(lookupHeading, lookupHelp, lookupInput, lookupResult);
  renderCards();
  root.append(heading, intro, search, categories, cards, lookup, status);
  return root;
}
