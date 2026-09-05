const routes = new Set(["#/home", "#/emergency", "#/progress"]);

export function currentRoute(): string {
  return routes.has(window.location.hash) ? window.location.hash : "#/home";
}

export function startRouter(): void {
  if (!routes.has(window.location.hash)) {
    window.location.hash = "#/home";
  }
}
