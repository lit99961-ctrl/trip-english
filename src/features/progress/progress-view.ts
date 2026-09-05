import { allMissions } from "../../content/catalog";
import type { LearnerProgressV1 } from "../../domain/progress";
import type { RecordingSession, SpeechPort } from "../../speech/speech-port";
import {
  createBackupDownload,
  inspectBackupImport,
  readBackupText,
  restoreBackup,
  type BackupPreview
} from "../../storage/backup-codec";
import type { ProgressRepository } from "../../storage/progress-repository";
import { requestPersistentStorage } from "../../storage/persistence";

const FINAL_RECORDING_KEY = "final/comparison";

export interface ProgressView extends HTMLElement {
  dispose(): Promise<void>;
}

export interface ProgressViewOptions {
  repository: ProgressRepository;
  speech: Pick<SpeechPort, "startRecording">;
  requestPersistence?: () => Promise<"granted" | "best-effort" | "unsupported">;
  confirmRestore?: (preview: BackupPreview) => boolean | Promise<boolean>;
  createObjectURL?: (blob: Blob) => string;
  revokeObjectURL?: (url: string) => void;
  triggerDownload?: (download: { blob: Blob; filename: string }) => void;
}

function recallCount(progress: LearnerProgressV1): number {
  const targetIds = new Set(allMissions.flatMap((mission) =>
    mission.productionPhrases.filter((phrase) => phrase.activeTarget).map((phrase) => phrase.id)
  ));
  const recalled = new Set<string>();
  Object.values(progress.sessions).forEach((session) => {
    Object.entries(session.phraseClasses ?? {}).forEach(([phraseId, phraseClass]) => {
      if (targetIds.has(phraseId) && (phraseClass === "recalled" || phraseClass === "mastered")) {
        recalled.add(phraseId);
      }
    });
  });
  return recalled.size;
}

function hintTrend(progress: LearnerProgressV1): string {
  const attempts = Object.values(progress.sessions).flatMap((session) =>
    Object.values(session.phraseAttempts ?? {}).flat()
  ).filter((attempt) => attempt.hintCount !== undefined)
    .map((attempt, index) => ({ attempt, index }))
    .sort((left, right) => {
      const leftTime = left.attempt.timestamp ? Date.parse(left.attempt.timestamp) : Number.NaN;
      const rightTime = right.attempt.timestamp ? Date.parse(right.attempt.timestamp) : Number.NaN;
      return Number.isFinite(leftTime) && Number.isFinite(rightTime)
        ? leftTime - rightTime
        : left.index - right.index;
    })
    .map(({ attempt }) => attempt);
  if (attempts.length < 2) return `累计使用 ${progress.hintCount} 次提示`;
  const midpoint = Math.floor(attempts.length / 2);
  const average = (values: typeof attempts): number =>
    values.reduce((sum, attempt) => sum + (attempt.hintCount ?? 0), 0) / values.length;
  const display = (value: number): string => Number.isInteger(value) ? String(value) : value.toFixed(1);
  const earlier = average(attempts.slice(0, midpoint));
  const recent = average(attempts.slice(midpoint));
  if (recent < earlier) return `每次提示从 ${display(earlier)} 降到 ${display(recent)}`;
  if (recent > earlier) return `每次提示从 ${display(earlier)} 升到 ${display(recent)}`;
  return `每次提示保持 ${display(recent)}`;
}

function defaultDownload(download: { blob: Blob; filename: string }): void {
  const createUrl = URL.createObjectURL?.bind(URL);
  if (!createUrl) throw new Error("download unavailable");
  const url = createUrl(download.blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = download.filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL?.(url), 0);
}

export async function renderProgress(options: ProgressViewOptions): Promise<ProgressView> {
  const root = document.createElement("section") as ProgressView;
  root.className = "progress-view stack";
  root.setAttribute("aria-live", "polite");
  let disposed = false;
  let recording: RecordingSession | undefined;
  const objectUrls: string[] = [];

  root.dispose = async () => {
    disposed = true;
    if (recording) await recording.stop().catch(() => undefined);
    objectUrls.forEach((url) => (options.revokeObjectURL ?? URL.revokeObjectURL)?.(url));
  };

  let progress: LearnerProgressV1;
  try {
    progress = await options.repository.load();
  } catch {
    const error = document.createElement("p");
    error.setAttribute("role", "alert");
    error.textContent = "无法读取学习进度，请刷新后重试。";
    root.append(error);
    return root;
  }
  const persistence = await (options.requestPersistence ?? requestPersistentStorage)().catch(() => "best-effort" as const);

  const heading = document.createElement("h1");
  heading.textContent = "冲刺进度";
  const metrics = document.createElement("div");
  metrics.className = "metric-grid";
  const metric = (label: string, value: string): HTMLElement => {
    const card = document.createElement("article");
    const title = document.createElement("h2");
    title.textContent = label;
    const copy = document.createElement("p");
    copy.textContent = value;
    card.append(title, copy);
    return card;
  };
  metrics.append(
    metric("开口时间", `${Math.floor(progress.speakingSeconds / 60)} / 120 分钟`),
    metric("主动回忆", `${recallCount(progress)} / 30`),
    metric("独立完成", `无提示场景 ${new Set(progress.promptFreeScenarioIds).size}`),
    metric("提示趋势", hintTrend(progress))
  );

  const persistenceStatus = document.createElement("p");
  persistenceStatus.className = "metric-chip";
  persistenceStatus.textContent = persistence === "granted"
    ? "已授权持久存储"
    : persistence === "unsupported"
      ? "此浏览器不支持持久存储；请定期备份"
      : "浏览器可能清理本地数据；请定期备份";

  const recordingSection = document.createElement("section");
  const recordingHeading = document.createElement("h2");
  recordingHeading.textContent = "起点 / 终点录音对比";
  const recordingStatus = document.createElement("p");
  recordingStatus.setAttribute("role", "status");
  const recordings = document.createElement("div");
  recordings.className = "recording-comparison";
  const createUrl = options.createObjectURL ?? URL.createObjectURL?.bind(URL);
  const appendRecording = (label: string, blob: Blob | undefined): void => {
    const panel = document.createElement("div");
    const title = document.createElement("h3");
    title.textContent = label;
    panel.append(title);
    if (blob && createUrl) {
      const url = createUrl(blob);
      objectUrls.push(url);
      const audio = document.createElement("audio");
      audio.controls = true;
      audio.src = url;
      audio.setAttribute("aria-label", `${label}录音`);
      panel.append(audio);
    } else {
      const empty = document.createElement("p");
      empty.textContent = "还没有录音";
      panel.append(empty);
    }
    recordings.append(panel);
  };
  const baselineKey = progress.calibration?.recordingKeys[0];
  const [baseline, final] = await Promise.all([
    baselineKey ? options.repository.loadRecording(baselineKey).catch(() => undefined) : undefined,
    options.repository.loadRecording(FINAL_RECORDING_KEY).catch(() => undefined)
  ]);
  appendRecording("起点", baseline);
  appendRecording("终点", final);
  const recordButton = document.createElement("button");
  recordButton.type = "button";
  recordButton.className = "secondary-action";
  recordButton.textContent = "录制终点样本";
  recordButton.addEventListener("click", async () => {
    recordButton.disabled = true;
    if (!recording) {
      try {
        recording = await options.speech.startRecording();
        if (disposed) {
          await recording.stop().catch(() => undefined);
          recording = undefined;
          return;
        }
        recordButton.textContent = "停止并保存";
        recordingStatus.textContent = "正在录音，请说一段旅途中会用到的英语。";
      } catch {
        recordingStatus.setAttribute("role", "alert");
        recordingStatus.textContent = "麦克风不可用；已有进度不会受影响。";
      }
      recordButton.disabled = false;
      return;
    }
    const active = recording;
    recording = undefined;
    try {
      const blob = await active.stop();
      await options.repository.saveRecording(FINAL_RECORDING_KEY, blob);
      recordingStatus.setAttribute("role", "status");
      recordingStatus.textContent = "终点录音已保存，重新打开本页即可对比。";
      recordButton.textContent = "重新录制终点样本";
    } catch {
      recordingStatus.setAttribute("role", "alert");
      recordingStatus.textContent = "录音未保存，请检查麦克风或存储空间后重试。";
      recordButton.textContent = "重新录制终点样本";
    }
    recordButton.disabled = false;
  });
  recordingSection.append(recordingHeading, recordings, recordButton, recordingStatus);

  const dataSection = document.createElement("section");
  const dataHeading = document.createElement("h2");
  dataHeading.textContent = "本地数据";
  const dataStatus = document.createElement("p");
  dataStatus.setAttribute("role", "status");
  const backupButton = document.createElement("button");
  backupButton.type = "button";
  backupButton.textContent = "下载备份";
  backupButton.addEventListener("click", () => {
    try {
      const download = createBackupDownload(progress);
      (options.triggerDownload ?? defaultDownload)(download);
      dataStatus.textContent = "备份已生成，请妥善保存。";
    } catch {
      dataStatus.setAttribute("role", "alert");
      dataStatus.textContent = "备份生成失败，请稍后重试。";
    }
  });
  const restoreLabel = document.createElement("label");
  restoreLabel.textContent = "从备份恢复";
  const restoreInput = document.createElement("input");
  restoreInput.type = "file";
  restoreInput.accept = "application/json,.json";
  restoreInput.addEventListener("change", async () => {
    const file = restoreInput.files?.[0];
    if (!file) return;
    restoreInput.disabled = true;
    try {
      const text = await readBackupText(file);
      const inspected = inspectBackupImport(text);
      const confirm = options.confirmRestore ?? ((preview: BackupPreview) =>
        window.confirm(`确认恢复 ${preview.missionCount} 个任务的记录？当前记录会被替换。`));
      const result = await restoreBackup(options.repository, text, () => confirm(inspected.preview));
      if (result.restored) {
        progress = result.progress;
        dataStatus.setAttribute("role", "status");
        dataStatus.textContent = "恢复完成。返回首页即可从备份位置继续。";
      } else {
        dataStatus.textContent = result.reason === "cancelled" ? "已取消恢复。" : "恢复被更新的数据中止，请重试。";
      }
    } catch {
      dataStatus.setAttribute("role", "alert");
      dataStatus.textContent = "无法恢复：请选择由本应用生成的有效备份。";
    } finally {
      restoreInput.disabled = false;
      restoreInput.value = "";
    }
  });
  restoreLabel.append(restoreInput);
  dataSection.append(dataHeading, backupButton, restoreLabel, dataStatus);
  root.append(heading, metrics, persistenceStatus, recordingSection, dataSection);
  return root;
}
