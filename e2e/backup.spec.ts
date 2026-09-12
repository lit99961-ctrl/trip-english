import { expect, test } from "@playwright/test";
import { installFakeMicrophone, startHotelAndCompleteFirstExercise } from "./helpers";

test("downloads progress and restores it into a fresh browser context", async ({ browser, page }) => {
  await installFakeMicrophone(page);
  await page.goto("/");
  await startHotelAndCompleteFirstExercise(page);
  await page.getByRole("link", { name: "进度" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "下载备份" }).click();
  const download = await downloadPromise;
  const backupPath = await download.path();
  expect(backupPath).not.toBeNull();

  const fresh = await browser.newContext();
  const restored = await fresh.newPage();
  await installFakeMicrophone(restored);
  await restored.goto("/#/progress");
  await restored.locator('input[type="file"]').setInputFiles(backupPath!);
  await expect(restored.getByRole("heading", { name: "确认替换当前进度" })).toBeVisible();
  await expect(restored.getByText(/备份日期 .*课程版本 1.*任务记录 1/)).toBeVisible();
  await restored.getByRole("button", { name: "确认替换" }).click();
  await expect(restored.getByText("恢复完成。返回首页即可从备份位置继续。")).toBeVisible();
  await restored.getByRole("link", { name: "首页" }).click();
  await expect(restored.getByRole("heading", { name: "酒店入住" })).toBeVisible();
  await fresh.close();
});

test("rejects invalid JSON without replacing current progress", async ({ page }) => {
  await installFakeMicrophone(page);
  await page.goto("/");
  await startHotelAndCompleteFirstExercise(page);
  await page.getByRole("link", { name: "进度" }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "broken.json",
    mimeType: "application/json",
    buffer: Buffer.from("not json")
  });
  await expect(page.getByText(/无法恢复/)).toBeVisible();
  await page.getByRole("link", { name: "首页" }).click();
  await expect(page.getByRole("heading", { name: "酒店入住" })).toBeVisible();
});
