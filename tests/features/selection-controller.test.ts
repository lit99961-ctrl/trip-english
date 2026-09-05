import { afterEach, describe, expect, it, vi } from "vitest";
import { readSelectedEnglish, SelectionController } from "../../src/selection/selection-controller";

describe("readSelectedEnglish", () => {
  afterEach(() => {
    window.getSelection()?.removeAllRanges();
    document.body.replaceChildren();
  });

  it("reads a selected English span without requiring data-english", () => {
    document.body.innerHTML = "<p>The train is <span>delayed</span>.</p>";
    const range = document.createRange();
    range.selectNodeContents(document.querySelector("span")!);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);

    expect(readSelectedEnglish(selection)).toBe("delayed");
  });

  it("shows action controls only for English inside one data-english region", () => {
    document.body.innerHTML = '<p data-english>The train is <span>delayed</span>.</p><p>中文</p>';
    const controller = new SelectionController({ speech: { speak: vi.fn() }, onLookup: vi.fn(), onSave: vi.fn() });
    const range = document.createRange();
    range.selectNodeContents(document.querySelector("span")!);
    const selection = window.getSelection()!;
    selection.removeAllRanges(); selection.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
    expect(document.querySelector("[data-selection-actions]")).not.toBeNull();
    expect(selection.toString()).toBe("delayed");
    controller.destroy();
  });

  it("hides actions for Chinese-only or region-spanning selections", () => {
    document.body.innerHTML = '<p data-english>The train is <span>delayed</span>.</p><p>中文</p>';
    const controller = new SelectionController({ speech: { speak: vi.fn() }, onLookup: vi.fn(), onSave: vi.fn() });
    const selection = window.getSelection()!;
    const chinese = document.createRange(); chinese.selectNodeContents(document.querySelectorAll("p")[1]!);
    selection.removeAllRanges(); selection.addRange(chinese); document.dispatchEvent(new Event("selectionchange"));
    expect(document.querySelector("[data-selection-actions]")).toBeNull();
    const spanning = document.createRange();
    spanning.setStart(document.querySelector("[data-english]")!.firstChild!, 0);
    spanning.setEnd(document.querySelectorAll("p")[1]!.firstChild!, 1);
    selection.removeAllRanges(); selection.addRange(spanning); document.dispatchEvent(new Event("selectionchange"));
    expect(document.querySelector("[data-selection-actions]")).toBeNull();
    controller.destroy();
  });

  it("wires actions while preserving selection and native defaults, then cleans up", async () => {
    document.body.innerHTML = '<p data-english>The train is <span>delayed</span>.</p>';
    const speak = vi.fn().mockResolvedValue(undefined); const lookup = vi.fn(); const save = vi.fn();
    const controller = new SelectionController({ speech: { speak }, onLookup: lookup, onSave: save });
    const range = document.createRange(); range.selectNodeContents(document.querySelector("span")!);
    const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range); document.dispatchEvent(new Event("selectionchange"));
    const bar = document.querySelector<HTMLElement>("[data-selection-actions]")!;
    expect([...bar.querySelectorAll("button")].map((button) => button.textContent)).toEqual(["朗读", "慢速", "中文", "加入复习"]);
    for (const label of ["朗读", "慢速", "中文", "加入复习"]) bar.querySelector<HTMLButtonElement>(`button[aria-label='${label}']`)!.click();
    await Promise.resolve();
    expect(speak).toHaveBeenNthCalledWith(1, "delayed", 1); expect(speak).toHaveBeenNthCalledWith(2, "delayed", 0.75);
    expect(lookup).toHaveBeenCalledWith("delayed"); expect(save).toHaveBeenCalledWith("delayed"); expect(selection.toString()).toBe("delayed");
    for (const type of ["contextmenu", "touchstart", "selectionchange"]) { const event = new Event(type, { cancelable: true }); document.dispatchEvent(event); expect(event.defaultPrevented).toBe(false); }
    controller.destroy(); expect(document.querySelector("[data-selection-actions]")).toBeNull();
  });
});
