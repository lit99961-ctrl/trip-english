import type { SupportLevel } from "../../domain/lesson-engine";
import type { RecordingSession, SpeechPort } from "../../speech/speech-port";

export interface CalibrationBaseline {
  supportLevel: SupportLevel;
  correctItems: number;
  speakingSeconds: number;
  completedAt: string;
  recordingKeys: string[];
}

export interface CalibrationStore {
  saveCalibrationResult(baseline: CalibrationBaseline): Promise<unknown> | unknown;
  saveRecording(key: string, recording: Blob): Promise<void> | void;
}

export interface CalibrationView extends HTMLElement {
  dispose(): Promise<void>;
}

export interface CalibrationOptions {
  speech: SpeechPort;
  store: CalibrationStore;
  now?: () => number;
  onComplete?: () => void;
  createObjectURL?: (recording: Blob) => string;
  revokeObjectURL?: (url: string) => void;
}

type ChoiceItem = {
  kind: "recognition" | "listening-intent";
  prompt: string;
  phrase?: string;
  choices: readonly string[];
  answer: string;
};
type SpeakingItem = { kind: "speaking"; prompt: string };
type CalibrationItem = ChoiceItem | SpeakingItem;

const items: readonly CalibrationItem[] = [
  {
    kind: "recognition",
    prompt: "Which word means 酒店预订?",
    choices: ["reservation", "platform", "receipt"],
    answer: "reservation"
  },
  {
    kind: "recognition",
    prompt: "Which word means 火车站台?",
    choices: ["platform", "breakfast", "passport"],
    answer: "platform"
  },
  {
    kind: "listening-intent",
    prompt: "听后选择：对方想做什么？",
    phrase: "I would like to check in.",
    choices: ["办理值机", "餐厅结账", "购买衣服"],
    answer: "办理值机"
  },
  {
    kind: "listening-intent",
    prompt: "听后选择：对方需要什么？",
    phrase: "Could I have the bill, please?",
    choices: ["账单", "地图", "房卡"],
    answer: "账单"
  },
  { kind: "speaking", prompt: "请用英语说：你好，我姓李。" },
  { kind: "speaking", prompt: "请用英语说：我去意大利和瑞士旅行。" }
];

function choiceField(choices: readonly string[], name: string): HTMLFieldSetElement {
  const fieldset = document.createElement("fieldset");
  const legend = document.createElement("legend");
  legend.textContent = "选择答案";
  fieldset.append(legend);
  for (const choice of choices) {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "radio";
    input.name = name;
    input.value = choice;
    label.append(input, document.createTextNode(choice));
    fieldset.append(label);
  }
  return fieldset;
}

export function renderCalibration(options: CalibrationOptions): CalibrationView {
  const root = document.createElement("section") as CalibrationView;
  root.className = "calibration-view";
  root.setAttribute("aria-live", "polite");
  const now = options.now ?? Date.now;
  let index = -1;
  let correctItems = 0;
  let speakingMilliseconds = 0;
  let recording: RecordingSession | undefined;
  let recordingStartedAt = 0;
  let recordingResult: Blob | undefined;
  let recordingUrl: string | undefined;
  const recordingKeys: string[] = [];
  let disposed = false;
  let saveError: string | undefined;
  let speakingPhase: "idle" | "recording" | "rating" = "idle";

  const render = (): void => {
    if (disposed) return;
    if (recordingUrl) {
      (options.revokeObjectURL ?? URL.revokeObjectURL)?.(recordingUrl);
      recordingUrl = undefined;
    }
    root.replaceChildren();
    const heading = document.createElement("h1");
    heading.tabIndex = -1;
    const primary = document.createElement("button");
    primary.type = "button";
    primary.className = "primary-action";

    if (index < 0) {
      heading.textContent = "2 分钟起点小游戏";
      const copy = document.createElement("p");
      copy.textContent = "做 6 个小任务，帮你调整接下来的提示多少。";
      primary.textContent = "开始";
      primary.addEventListener("click", () => { index = 0; render(); });
      root.append(heading, copy, primary);
    } else if (index >= items.length) {
      const supportLevel: SupportLevel = correctItems >= 5
        ? "prompt-only"
        : correctItems >= 3 ? "partial" : "full";
      heading.textContent = "起始提示级别";
      const result = document.createElement("p");
      result.textContent = supportLevel === "prompt-only"
        ? "少提示"
        : supportLevel === "partial" ? "适量提示" : "完整提示";
      primary.textContent = "进入今天训练";
      primary.addEventListener("click", () => {
        if (options.onComplete) options.onComplete();
        else root.dispatchEvent(new CustomEvent("app:navigate", {
          bubbles: true,
          detail: { href: "#/home" }
        }));
      });
      root.append(heading, result, primary);
    } else {
      const item = items[index]!;
      root.dataset.currentKind = item.kind;
      heading.textContent = `第 ${index + 1} 题`;
      const prompt = document.createElement("p");
      prompt.textContent = item.prompt;
      root.append(heading, prompt);

      if (item.kind !== "speaking") {
        if (item.kind === "listening-intent" && item.phrase) {
          const listen = document.createElement("button");
          listen.type = "button";
          listen.className = "secondary-action";
          listen.textContent = "播放英文";
          listen.setAttribute("aria-label", "播放题目英文");
          listen.addEventListener("click", () => { void options.speech.speak(item.phrase!, 1); });
          root.append(listen);
        }
        root.append(choiceField(item.choices, `calibration-${index}`));
        primary.textContent = "下一题";
        primary.addEventListener("click", () => {
          const selected = root.querySelector<HTMLInputElement>('input[type="radio"]:checked');
          if (!selected) return;
          if (selected.value === item.answer) correctItems += 1;
          index += 1;
          render();
        });
      } else if (speakingPhase === "idle") {
        primary.textContent = "开始录音";
        primary.addEventListener("click", async () => {
          primary.disabled = true;
          try {
            recording = await options.speech.startRecording();
            if (disposed) {
              await recording.stop().catch(() => undefined);
              recording = undefined;
              return;
            }
            recordingStartedAt = now();
            speakingPhase = "recording";
          } catch {
            recording = undefined;
            speakingPhase = "rating";
          }
          render();
        });
      } else if (speakingPhase === "recording") {
        primary.textContent = "停止录音";
        primary.addEventListener("click", async () => {
          primary.disabled = true;
          const stoppedAt = now();
          try {
            recordingResult = await recording!.stop();
            speakingMilliseconds += Math.max(0, stoppedAt - recordingStartedAt);
            const recordingKey = `baseline/speaking-${index - 3}`;
            await options.store.saveRecording(recordingKey, recordingResult);
            recordingKeys.push(recordingKey);
          } catch {
            recordingResult = undefined;
          }
          speakingPhase = "rating";
          render();
        });
      } else {
        const help = document.createElement("p");
        help.textContent = recordingResult ? "回听后按真实感受选择。" : "麦克风不可用，也可以先无声练习。";
        if (recordingResult) {
          const audio = document.createElement("audio");
          audio.controls = true;
          audio.setAttribute("aria-label", "回听刚才的校准录音");
          const createObjectURL = options.createObjectURL ?? URL.createObjectURL?.bind(URL);
          if (createObjectURL) {
            recordingUrl = createObjectURL(recordingResult);
            audio.src = recordingUrl;
          }
          root.append(help, audio);
        } else {
          root.append(help);
        }
        const rating = choiceField(["smooth", "retry"], `calibration-rating-${index}`);
        for (const label of rating.querySelectorAll("label")) {
          if (label.textContent === "smooth") label.lastChild!.textContent = "说顺了";
          if (label.textContent === "retry") label.lastChild!.textContent = "还不熟";
        }
        if (saveError) {
          const error = document.createElement("p");
          error.setAttribute("role", "alert");
          error.textContent = saveError;
          root.append(error);
        }
        primary.textContent = "确认";
        primary.addEventListener("click", async () => {
          primary.disabled = true;
          const selected = root.querySelector<HTMLInputElement>('input[type="radio"]:checked');
          if (!selected) {
            primary.disabled = false;
            return;
          }
          const candidateCorrectItems = correctItems + (selected.value === "smooth" ? 1 : 0);
          if (index === items.length - 1) {
            const supportLevel: SupportLevel = candidateCorrectItems >= 5
              ? "prompt-only"
              : candidateCorrectItems >= 3 ? "partial" : "full";
            try {
              await options.store.saveCalibrationResult({
                supportLevel,
                correctItems: candidateCorrectItems,
                speakingSeconds: speakingMilliseconds / 1_000,
                completedAt: new Date(now()).toISOString(),
                recordingKeys: [...recordingKeys]
              });
            } catch {
              saveError = "未能保存，校准结果还在这里。请检查存储空间后重试。";
              render();
              return;
            }
          }
          correctItems = candidateCorrectItems;
          index += 1;
          speakingPhase = "idle";
          recording = undefined;
          recordingResult = undefined;
          saveError = undefined;
          render();
        });
        root.append(rating);
      }
      root.append(primary);
    }
    queueMicrotask(() => heading.focus());
  };

  render();
  root.dispose = async () => {
    if (disposed) return;
    disposed = true;
    if (recordingUrl) {
      (options.revokeObjectURL ?? URL.revokeObjectURL)?.(recordingUrl);
      recordingUrl = undefined;
    }
    const activeRecording = recording;
    recording = undefined;
    if (activeRecording && speakingPhase === "recording") {
      await activeRecording.stop().catch(() => undefined);
    }
    root.replaceChildren();
  };
  return root;
}

export const calibrationItems = items;
