import type { DeepReadonly } from "../../content/content-validation";
import type { Mission } from "../../domain/content-schema";
import { groupPhraseMap, learningProgressLabel, nextLearningScreen } from "../../domain/mission-learning";
import type { LearnerProgressV1 } from "../../domain/progress";
import type { RecordingSession, SpeechPort } from "../../speech/speech-port";
import type { AdvanceMissionIntroductionInput, ProgressRepository } from "../../storage/progress-repository";

export interface LearningView extends HTMLElement {
  dispose(): Promise<void>;
}

export interface LearningViewOptions {
  mission: DeepReadonly<Mission>;
  progress: LearnerProgressV1;
  repository: Pick<ProgressRepository, "advanceMissionIntroduction">;
  speech: Pick<SpeechPort, "speak" | "startRecording">;
  onComplete: () => void;
  now?: () => Date;
  createObjectURL?: (blob: Blob) => string;
  revokeObjectURL?: (url: string) => void;
}

export function renderLearning(options: LearningViewOptions): LearningView {
  const sentences = options.mission.learningSentences ?? [];
  if (sentences.length === 0) throw new Error(`mission ${options.mission.id} has no learning content`);
  const orderedSentenceIds = sentences.map((sentence) => sentence.id);
  let progress = options.progress;
  let pending: AdvanceMissionIntroductionInput | undefined;
  let saveError = "";
  let recordedCurrentSentence = false;
  let recording: RecordingSession | undefined;
  let recordingUrl: string | undefined;
  let disposed = false;
  const root = document.createElement("section") as LearningView;
  root.className = "learning-view stack";

  const reportPlaybackError = () => {
    let error = root.querySelector<HTMLElement>("[data-learning-error]");
    if (!error) {
      error = document.createElement("p");
      error.dataset.learningError = "true";
      error.setAttribute("role", "alert");
      root.append(error);
    }
    error.textContent = "播放失败，你仍然可以阅读英文继续学习。";
  };
  const play = (text: string, rate: 0.75 | 1) => {
    try { void options.speech.speak(text, rate).catch(reportPlaybackError); }
    catch { reportPlaybackError(); }
  };
  const save = async (input: AdvanceMissionIntroductionInput): Promise<boolean> => {
    pending ??= input;
    try {
      progress = await options.repository.advanceMissionIntroduction(pending);
      pending = undefined;
      saveError = "";
      recordedCurrentSentence = false;
      if (input.kind === "sentence" && recordingUrl) {
        (options.revokeObjectURL ?? URL.revokeObjectURL)(recordingUrl);
        recordingUrl = undefined;
      }
      return true;
    } catch {
      saveError = "保存失败，本句没有跳过。请重试保存。";
      return false;
    }
  };
  const appendError = () => {
    if (!saveError) return;
    const error = document.createElement("p");
    error.dataset.learningError = "true";
    error.setAttribute("role", "alert");
    error.textContent = saveError;
    root.append(error);
  };
  const speechButtons = (text: string): HTMLElement => {
    const controls = document.createElement("div");
    controls.className = "learning-audio-actions";
    for (const [label, rate] of [["正常播放", 1], ["慢速播放", 0.75]] as const) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "secondary-action";
      button.textContent = label;
      button.addEventListener("click", () => play(text, rate));
      controls.append(button);
    }
    return controls;
  };
  const backLink = (): HTMLAnchorElement => {
    const back = document.createElement("a");
    back.href = "#/home";
    back.dataset.learningBack = "true";
    back.className = "learning-back";
    back.textContent = "返回首页";
    return back;
  };
  const render = () => {
    if (disposed) return;
    root.replaceChildren();
    const introduction = progress.missionIntroductions?.[options.mission.id];
    const screen = nextLearningScreen(sentences, introduction);
    root.dataset.screen = screen.type;

    if (screen.type === "sentence") {
      const sentence = sentences[screen.index]!;
      const eyebrow = document.createElement("p");
      eyebrow.className = "eyebrow";
      eyebrow.textContent = `${sentence.role === "production" ? "我可能要说" : "我可能听到"} · ${learningProgressLabel(screen.index, sentences.length)}`;
      const heading = document.createElement("h1");
      heading.textContent = options.mission.titleZh;
      const chinese = document.createElement("p");
      chinese.className = "learning-meaning";
      chinese.textContent = sentence.chinese;
      const english = document.createElement("p");
      english.className = "learning-english selectable-english";
      english.lang = "en";
      english.textContent = sentence.english;
      const chunks = document.createElement("div");
      chunks.className = "learning-chunks";
      chunks.setAttribute("aria-label", "跟读分段");
      sentence.chunks.forEach((chunk) => {
        const part = document.createElement("button");
        part.type = "button";
        part.lang = "en";
        part.textContent = chunk;
        part.addEventListener("click", () => play(chunk, 0.75));
        chunks.append(part);
      });
      const usage = document.createElement("p");
      usage.textContent = `什么时候用：${sentence.usageZh}`;
      const keywords = document.createElement("p");
      keywords.className = "metric-chip";
      keywords.textContent = `关键词：${sentence.keywords.join(" · ")}`;
      root.append(backLink(), eyebrow, heading, chinese, english, chunks, usage, keywords, speechButtons(sentence.english));

      if (sentence.role === "production") {
        const record = document.createElement("button");
        record.type = "button";
        record.className = "secondary-action";
        record.dataset.learningRecord = "true";
        record.textContent = recording ? "停止并回听" : "录音跟读";
        record.addEventListener("click", async () => {
          try {
            if (!recording) {
              recording = await options.speech.startRecording();
              if (!disposed) render();
              return;
            }
            const active = recording;
            recording = undefined;
            const blob = await active.stop();
            recordedCurrentSentence = true;
            if (recordingUrl) (options.revokeObjectURL ?? URL.revokeObjectURL)(recordingUrl);
            recordingUrl = (options.createObjectURL ?? URL.createObjectURL)(blob);
            if (!disposed) render();
          } catch {
            recording = undefined;
            reportPlaybackError();
          }
        });
        root.append(record);
        if (recordingUrl) {
          const audio = document.createElement("audio");
          audio.controls = true;
          audio.src = recordingUrl;
          root.append(audio);
        }
      }
      const primary = document.createElement("button");
      primary.type = "button";
      primary.className = "primary-action";
      primary.textContent = pending ? "重试保存" : "学会这句，继续";
      primary.addEventListener("click", async () => {
        primary.disabled = true;
        const saved = await save({
          kind: "sentence", missionId: options.mission.id, orderedSentenceIds,
          expectedIndex: screen.index, sentenceId: sentence.id,
          shadowed: sentence.role === "production" && recordedCurrentSentence
        });
        if (saved) render(); else { primary.disabled = false; render(); }
      });
      appendError();
      root.append(primary);
      return;
    }

    if (screen.type === "recap") {
      const heading = document.createElement("h1");
      heading.textContent = "轻松回顾";
      const copy = document.createElement("p");
      copy.textContent = "先看中文，试着想起英文；想不起来也没关系，再揭示答案。不计分。";
      const list = document.createElement("ul");
      const recapSentences = sentences.slice(screen.index - 5, screen.index);
      recapSentences.forEach((sentence) => {
        const item = document.createElement("li");
        item.textContent = sentence.chinese;
        list.append(item);
      });
      const reveal = document.createElement("button");
      reveal.type = "button";
      reveal.className = "secondary-action";
      reveal.dataset.revealRecap = "true";
      reveal.textContent = "显示英文答案";
      reveal.addEventListener("click", () => {
        [...list.children].forEach((item, index) => {
          item.textContent = `${recapSentences[index]!.chinese} — ${recapSentences[index]!.english}`;
        });
        reveal.disabled = true;
        reveal.textContent = "答案已显示";
      });
      const primary = document.createElement("button");
      primary.type = "button";
      primary.className = "primary-action";
      primary.textContent = pending ? "重试保存" : "看过了，继续学习";
      primary.addEventListener("click", async () => {
        primary.disabled = true;
        const saved = await save({ kind: "recap", missionId: options.mission.id, atIndex: screen.index });
        if (saved) render(); else { primary.disabled = false; render(); }
      });
      root.append(backLink(), heading, copy, list, reveal);
      appendError();
      root.append(primary);
      return;
    }

    const heading = document.createElement("h1");
    heading.textContent = `${options.mission.titleZh}句子地图`;
    const groups = groupPhraseMap(sentences);
    const addGroup = (title: string, items: typeof groups.production) => {
      const section = document.createElement("section");
      const titleElement = document.createElement("h2");
      titleElement.textContent = title;
      const list = document.createElement("ul");
      items.forEach((sentence) => {
        const item = document.createElement("li");
        item.lang = "en";
        item.textContent = `${sentence.english} — ${sentence.chinese}`;
        list.append(item);
      });
      section.append(titleElement, list);
      root.append(section);
    };
    root.append(backLink(), heading);
    addGroup("我可能要说", groups.production);
    addGroup("我可能听到", groups.reception);
    const primary = document.createElement("button");
    primary.type = "button";
    primary.className = "primary-action";
    primary.textContent = pending ? "重试保存" : "进入练习";
    primary.addEventListener("click", async () => {
      primary.disabled = true;
      const saved = await save({
        kind: "complete", missionId: options.mission.id, orderedSentenceIds,
        completedAt: (options.now ?? (() => new Date()))().toISOString()
      });
      if (saved && !disposed) options.onComplete(); else { primary.disabled = false; render(); }
    });
    appendError();
    root.append(primary);
  };

  root.dispose = async () => {
    disposed = true;
    if (recording) {
      const active = recording;
      recording = undefined;
      await active.stop().catch(() => undefined);
    }
    if (recordingUrl) (options.revokeObjectURL ?? URL.revokeObjectURL)(recordingUrl);
    recordingUrl = undefined;
    root.replaceChildren();
  };
  render();
  return root;
}
