export const appRoutes = ["#/home", "#/emergency", "#/progress"] as const;
export type AppRoute = typeof appRoutes[number]
  | "#/sprint"
  | `#/review/${"morning" | "midday" | "evening"}`
  | `#/sprint/review/${"morning" | "midday" | "evening"}`
  | `#/${"lesson" | "learn" | "challenge"}/${string}`
  | `#/sprint/${"lesson" | "learn" | "challenge"}/${string}`;
const routes = new Set<string>(appRoutes);
const lessonRoutePattern = /^#\/lesson\/[a-z0-9]+(?:-[a-z0-9]+)*$/;
const sprintLessonRoutePattern = /^#\/sprint\/lesson\/[a-z0-9]+(?:-[a-z0-9]+)*$/;
const learnRoutePattern = /^#\/(?:sprint\/)?learn\/[a-z0-9]+(?:-[a-z0-9]+)*$/;
const challengeRoutePattern = /^#\/(?:sprint\/)?challenge\/[a-z0-9]+(?:-[a-z0-9]+)*$/;
const reviewRoutePattern = /^#\/review\/(?:morning|midday|evening)$/;
const sprintReviewRoutePattern = /^#\/sprint\/review\/(?:morning|midday|evening)$/;

export function currentRoute(): AppRoute {
  return routes.has(window.location.hash) || window.location.hash === "#/sprint"
    || lessonRoutePattern.test(window.location.hash) || sprintLessonRoutePattern.test(window.location.hash)
    || learnRoutePattern.test(window.location.hash) || challengeRoutePattern.test(window.location.hash)
    || reviewRoutePattern.test(window.location.hash) || sprintReviewRoutePattern.test(window.location.hash)
    ? window.location.hash as AppRoute
    : "#/home";
}

export function startRouter(onRoute: (route: AppRoute) => void = () => undefined): () => void {
  if (currentRoute() === "#/home" && window.location.hash !== "#/home") {
    window.location.hash = "#/home";
  }
  const route = () => onRoute(currentRoute());
  window.addEventListener("hashchange", route);
  route();
  return () => window.removeEventListener("hashchange", route);
}
