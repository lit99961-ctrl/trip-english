import { expect, test } from "@playwright/test";
import { installFakeMicrophone } from "./helpers";

test.beforeEach(async ({ page }) => {
  await installFakeMicrophone(page);
});

test("keeps navigation, headings, focus, and touch controls accessible", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page.getByRole("navigation", { name: "主要导航" })).toBeVisible();

  const visibleControls = page.locator("button:visible, input:visible, select:visible, textarea:visible, nav a:visible");
  const boxes = await visibleControls.evaluateAll((controls) => controls.map((control) => {
    const box = control.getBoundingClientRect();
    return { width: box.width, height: box.height };
  }));
  expect(boxes.length).toBeGreaterThan(0);
  expect(boxes.every(({ width, height }) => width >= 44 && height >= 44)).toBe(true);

  await page.keyboard.press("Tab");
  const focusedOutline = await page.evaluate(() => {
    const focused = document.activeElement as HTMLElement;
    const style = getComputedStyle(focused);
    return { tag: focused.tagName, width: style.outlineWidth, style: style.outlineStyle };
  });
  expect(focusedOutline.tag).not.toBe("BODY");
  expect(focusedOutline.style).not.toBe("none");
  expect(focusedOutline.width).not.toBe("0px");
});

test("supports reduced motion, Dynamic Type, and native English selection", async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByRole("link", { name: "急救箱" }).click();

  const reducedDuration = await page.locator(".app-shell").evaluate((element) => {
    const value = getComputedStyle(element).transitionDuration;
    return value.endsWith("ms") ? Number.parseFloat(value) / 1_000 : Number.parseFloat(value);
  });
  expect(reducedDuration).toBeLessThanOrEqual(0.000_01);
  await page.evaluate(() => { document.documentElement.style.fontSize = "32px"; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.getByRole("navigation", { name: "主要导航" })).toBeInViewport();

  const selected = await page.locator("[data-english]").first().evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
    return selection?.toString() ?? "";
  });
  expect(selected.length).toBeGreaterThan(3);
  await expect(page.locator(".selection-action-bar")).toBeVisible();
  await expect(page.getByText(/离线内容已就绪|正在准备离线内容/)).toBeVisible();
  expect(testInfo.project.name).toMatch(/chromium/);
});

test("keeps the learning cards selectable and within a phone viewport", async ({ page }) => {
  await page.goto("/#/lesson/hotel-checkin");
  await expect(page.locator(".learning-view")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const english = page.locator(".learning-english");
  await expect(english).toBeVisible();
  expect(await english.evaluate((element) => getComputedStyle(element).userSelect)).toBe("text");
  const buttons = page.locator(".learning-view button:visible");
  const sizes = await buttons.evaluateAll((items) => items.map((item) => {
    const box = item.getBoundingClientRect();
    return { width: box.width, height: box.height };
  }));
  expect(sizes.every(({ width, height }) => width >= 44 && height >= 44)).toBe(true);
});
