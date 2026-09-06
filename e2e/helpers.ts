import type { Page } from "@playwright/test";

export async function installFakeMicrophone(page: Page): Promise<void> {
  await page.addInitScript(() => {
    class FakeMediaRecorder extends EventTarget {
      state = "inactive";
      mimeType = "audio/webm";
      start(): void { this.state = "recording"; }
      stop(): void {
        this.state = "inactive";
        const data = new Event("dataavailable");
        Object.defineProperty(data, "data", { value: new Blob(["recording"], { type: this.mimeType }) });
        this.dispatchEvent(data);
        this.dispatchEvent(new Event("stop"));
      }
    }
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: async () => ({ getTracks: () => [{ stop: () => undefined }] }) }
    });
    Object.defineProperty(window, "MediaRecorder", { configurable: true, value: FakeMediaRecorder });
    Object.defineProperty(window, "SpeechRecognition", { configurable: true, value: undefined });
    Object.defineProperty(window, "webkitSpeechRecognition", { configurable: true, value: undefined });
  });
}

export async function completeCalibration(page: Page): Promise<void> {
  await page.getByRole("button", { name: "开始", exact: true }).click();
  for (const answer of ["reservation", "platform", "办理值机", "账单"]) {
    await page.getByLabel(answer, { exact: true }).check();
    await page.getByRole("button", { name: "下一题" }).click();
  }
  for (let index = 0; index < 2; index += 1) {
    await page.getByRole("button", { name: "开始录音" }).click();
    await page.getByRole("button", { name: "停止录音" }).click();
    await page.getByLabel("说顺了", { exact: true }).check();
    await page.getByRole("button", { name: "确认", exact: true }).click();
  }
  await page.getByRole("button", { name: "进入今天训练" }).click();
}

export async function completeCurrentSpeakingExercise(page: Page, rating = "说顺了"): Promise<void> {
  await page.getByRole("button", { name: "开始录音" }).click();
  await page.getByRole("button", { name: "停止录音" }).click();
  await page.getByLabel(rating, { exact: true }).check();
  await page.getByRole("button", { name: "继续", exact: true }).click();
}

export async function startHotelAndCompleteFirstExercise(page: Page): Promise<void> {
  await page.goto("/#/lesson/hotel-checkin");
  await page.getByRole("button", { name: "显示答案" }).click();
  await page.getByLabel("想起来了", { exact: true }).check();
  await page.getByRole("button", { name: "确认", exact: true }).click();
}
