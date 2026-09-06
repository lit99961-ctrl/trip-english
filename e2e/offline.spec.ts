import { expect, test } from "@playwright/test";

test("reopens the course in flight mode", async ({ page, context }) => {
  await page.goto("/");
  await expect(page.getByText("离线内容已就绪", { exact: true })).toBeVisible({ timeout: 20_000 });

  await context.setOffline(true);
  await page.reload();

  await expect(page.getByRole("link", { name: "急救箱" })).toBeVisible();
  await expect(page.getByText("离线可学习", { exact: true })).toBeVisible();
});
