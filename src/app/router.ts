export const appRoutes = ["#/home", "#/emergency", "#/progress"] as const;
export type AppRoute = typeof appRoutes[number];
const routes = new Set<string>(appRoutes);

export function currentRoute(): AppRoute {
  return routes.has(window.location.hash) ? window.location.hash as AppRoute : "#/home";
}

export function startRouter(onRoute: (route: AppRoute) => void = () => undefined): () => void {
  if (!routes.has(window.location.hash)) {
    window.location.hash = "#/home";
  }
  const route = () => onRoute(currentRoute());
  window.addEventListener("hashchange", route);
  route();
  return () => window.removeEventListener("hashchange", route);
}
