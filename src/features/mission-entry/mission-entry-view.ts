import type { DeepReadonly } from "../../content/content-validation";
import type { Mission } from "../../domain/content-schema";
import { introductionComplete } from "../../domain/mission-learning";
import type { LearnerProgressV1 } from "../../domain/progress";

export type MissionDestination = "learning" | "entry" | "lesson";

export function missionDestination(
  progress: LearnerProgressV1,
  mission: DeepReadonly<Mission>,
  explicitChallenge: boolean
): MissionDestination {
  if (!introductionComplete(progress, mission)) return "learning";
  return explicitChallenge ? "lesson" : "entry";
}

export interface MissionEntryOptions {
  mission: DeepReadonly<Mission>;
  onReview: () => void;
  onChallenge: () => void;
}

export function renderMissionEntry(options: MissionEntryOptions): HTMLElement {
  const root = document.createElement("section");
  root.className = "mission-entry-view stack";
  const eyebrow = document.createElement("p");
  eyebrow.className = "eyebrow";
  eyebrow.textContent = `${options.mission.city} · 已学过`;
  const heading = document.createElement("h1");
  heading.textContent = options.mission.titleZh;
  const copy = document.createElement("p");
  copy.textContent = "建议先快速浏览关键句，想直接检验自己也可以进入挑战。";
  const review = document.createElement("button");
  review.type = "button";
  review.className = "primary-action";
  review.textContent = "快速复习关键句";
  review.addEventListener("click", options.onReview);
  const challenge = document.createElement("button");
  challenge.type = "button";
  challenge.className = "secondary-action";
  challenge.textContent = "直接挑战";
  challenge.addEventListener("click", options.onChallenge);
  root.append(eyebrow, heading, copy, review, challenge);
  return root;
}
