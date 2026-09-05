import { afterEach, describe, expect, it } from "vitest";
import { createAppShell } from "../../src/app/create-app";

describe("app shell", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("exposes only the three approved destinations", () => {
    document.body.append(createAppShell());
    const links = [...document.querySelectorAll("nav a")];
    const labels = links.map((node) => node.textContent);
    const hrefs = links.map((node) => node.getAttribute("href"));

    expect(labels).toEqual(["首页", "急救箱", "进度"]);
    expect(hrefs).toEqual(["#/home", "#/emergency", "#/progress"]);
  });

  it("provides a focusable route outlet", () => {
    document.body.append(createAppShell());

    const outlet = document.querySelector("main#route-outlet");

    expect(outlet).not.toBeNull();
    expect(outlet?.getAttribute("tabindex")).toBe("-1");
  });
});
