import { expect, test } from "@playwright/test";
import { completeCalibration, completeCurrentSpeakingExercise, installFakeMicrophone } from "./helpers";

test.beforeEach(async ({ page }) => {
  await installFakeMicrophone(page);
  await page.clock.install({ time: new Date("2026-09-06T08:00:00.000Z") });
});

test("calibrates, completes a hotel mission, and resumes measured progress", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "2 分钟起点小游戏" })).toBeVisible();
  await completeCalibration(page);
  await page.getByRole("link", { name: "进度" }).click();
  await expect(page.getByText(/持久存储|定期备份/)).toBeVisible();

  await page.goto("/#/lesson/hotel-checkin");
  await page.getByRole("button", { name: "显示答案" }).click();
  await page.getByLabel("需要再练", { exact: true }).check();
  await page.getByRole("button", { name: "确认", exact: true }).click();
  await expect(page.getByText("已练习", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "进度" }).click();
  await expect(page.getByText("0 / 30", { exact: true })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("heading", { name: "听懂意思" })).toBeVisible();

  await page.locator('input[type="radio"]').first().check();
  await page.getByRole("button", { name: "继续", exact: true }).click();
  await completeCurrentSpeakingExercise(page);
  await completeCurrentSpeakingExercise(page);
  await completeCurrentSpeakingExercise(page);

  await expect(page.getByRole("heading", { name: "阅读收尾" })).toBeVisible();
  await page.getByRole("button", { name: "检查答案" }).click();
  await page.getByRole("button", { name: "完成阅读" }).click();
  await expect(page.getByRole("heading", { name: "酒店入住完成" })).toBeVisible();

  await page.clock.fastForward("11:00");
  await page.getByRole("button", { name: "返回今日任务" }).click();
  await expect(page.getByText(/待复习 [1-9]/)).toBeVisible();
  await expect(page.locator('[data-mastery="mastered"]')).toHaveCount(0);

  await page.reload();
  await expect(page.getByText(/待复习 [1-9]/)).toBeVisible();
  await expect(page.getByText(/练习中 \d+\/15/)).toBeVisible();
});
