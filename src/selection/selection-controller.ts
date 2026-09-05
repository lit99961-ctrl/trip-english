import type { SpeechPort } from "../speech/speech-port";

export function readSelectedEnglish(selection: Selection | null = typeof window === "undefined" ? null : window.getSelection()): string | null {
  if (!selection || selection.isCollapsed) return null;
  const text = selection.toString().trim();
  return text && /[A-Za-z]/.test(text) ? text : null;
}

export interface SelectionControllerOptions {
  document?: Document;
  speech: Pick<SpeechPort, "speak">;
  onLookup(text: string): void;
  onSave(text: string): void;
}

function closestEnglishRegion(node: Node | null): HTMLElement | null {
  const element = node instanceof Element ? node : node?.parentElement;
  return element?.closest<HTMLElement>("[data-english]") ?? null;
}

export class SelectionController {
  private readonly document: Document;
  private bar: HTMLElement | null = null;
  private selectedText: string | null = null;

  constructor(private readonly options: SelectionControllerOptions) {
    this.document = options.document ?? document;
    this.document.addEventListener("selectionchange", this.update);
    this.update();
  }

  destroy(): void {
    this.document.removeEventListener("selectionchange", this.update);
    this.hide();
  }

  private readonly update = (): void => {
    const selection = this.document.defaultView?.getSelection() ?? null;
    const text = readSelectedEnglish(selection);
    const region = selection && selection.rangeCount ? closestEnglishRegion(selection.anchorNode) : null;
    const focusRegion = selection && selection.rangeCount ? closestEnglishRegion(selection.focusNode) : null;
    if (!text || !region || region !== focusRegion) return this.hide();
    this.selectedText = text;
    this.show();
  };

  private show(): void {
    if (this.bar) return;
    const bar = this.document.createElement("div");
    bar.dataset.selectionActions = "";
    bar.className = "selection-action-bar";
    bar.setAttribute("role", "status");
    bar.setAttribute("aria-label", "已选择英文操作");
    const action = (label: string, callback: () => void) => {
      const button = this.document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.setAttribute("aria-label", label);
      button.addEventListener("click", callback);
      bar.append(button);
    };
    action("朗读", () => { if (this.selectedText) void this.options.speech.speak(this.selectedText, 1); });
    action("慢速", () => { if (this.selectedText) void this.options.speech.speak(this.selectedText, 0.75); });
    action("中文", () => { if (this.selectedText) this.options.onLookup(this.selectedText); });
    action("加入复习", () => { if (this.selectedText) this.options.onSave(this.selectedText); });
    this.document.body.append(bar);
    this.bar = bar;
  }

  private hide(): void {
    this.selectedText = null;
    this.bar?.remove();
    this.bar = null;
  }
}
