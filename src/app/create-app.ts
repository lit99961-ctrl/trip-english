import { createElement } from "../ui/dom";

const destinations = [
  { href: "#/home", label: "首页" },
  { href: "#/emergency", label: "急救箱" },
  { href: "#/progress", label: "进度" }
] as const;

export function createAppShell(): HTMLElement {
  const shell = createElement("div", "app-shell");
  const outlet = createElement("main");
  outlet.id = "route-outlet";
  outlet.tabIndex = -1;

  const navigation = createElement("nav");
  navigation.setAttribute("aria-label", "主要导航");

  for (const destination of destinations) {
    const link = createElement("a");
    link.href = destination.href;
    link.textContent = destination.label;
    navigation.append(link);
  }

  shell.append(outlet, navigation);
  return shell;
}
