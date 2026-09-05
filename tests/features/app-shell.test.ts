import { describe, expect, it } from "vitest";
import { createAppShell } from "../../src/app/create-app";

describe("app shell", () => {
  it("exposes only the three approved destinations", () => {
    document.body.append(createAppShell());
    const labels = [...document.querySelectorAll("nav a")].map((node) => node.textContent);
    expect(labels).toEqual(["首页", "急救箱", "进度"]);
  });
});
