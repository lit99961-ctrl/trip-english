import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const builtManifest = JSON.parse(readFileSync(
  fileURLToPath(new URL("../dist/manifest.webmanifest", import.meta.url)),
  "utf8"
)) as { start_url: string };
const basePath = builtManifest.start_url;

test("reopens the course in flight mode", async ({ page, context }) => {
  await page.goto(`${basePath}#/lesson/hotel-checkin`);
  await expect(page.locator(".learning-view")).toBeVisible();
  await expect(page.getByText("离线内容已就绪", { exact: true })).toBeVisible({ timeout: 20_000 });

  await context.setOffline(true);
  await page.reload();

  await expect(page.getByRole("link", { name: "急救箱" })).toBeVisible();
  await expect(page.getByText("离线可学习", { exact: true })).toBeVisible();
  await expect(page.locator(".learning-view")).toBeVisible();
});

test("serves every required offline asset under the configured base path", async ({ request }) => {
  for (const path of [
    "manifest.webmanifest",
    "sw.js",
    "icons/icon-192.png"
  ]) {
    const response = await request.get(`${basePath}${path}`);
    expect(response.status(), path).toBe(200);
  }

  const manifest = await (await request.get(`${basePath}manifest.webmanifest`)).json();
  expect(manifest.start_url).toBe(basePath);
  expect(manifest.scope).toBe(basePath);
  expect(manifest.icons.every((icon: { src: string }) => icon.src.startsWith(basePath))).toBe(true);

  const index = await (await request.get(basePath)).text();
  const localAssets = [...index.matchAll(/(?:src|href)="(\/[^\"]+)"/g)].map((match) => match[1]!);
  expect(localAssets.every((asset) => asset.startsWith(basePath))).toBe(true);
  const applicationBundle = index.match(/src="([^"]+\.js)"/)?.[1];
  expect(applicationBundle).toBeTruthy();
  expect((await request.get(applicationBundle!)).status()).toBe(200);
});
