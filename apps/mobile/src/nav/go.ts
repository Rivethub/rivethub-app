import type { SubjectRef } from "@rivethub/contracts";
import type { StepLink } from "../lib/journey";
import { navigationRef } from "./ref";

export function openSubject(subject: SubjectRef): void {
  if (!navigationRef.isReady()) return;
  if (subject.kind === "topic") navigationRef.navigate("Topic", { id: subject.id });
  else if (subject.kind === "entity") navigationRef.navigate("Entity", { id: subject.id });
  else navigationRef.navigate("Session", { id: subject.id });
}

export function openReview(): void {
  if (navigationRef.isReady()) navigationRef.navigate("Tabs", { screen: "Review" });
}

export function openStep(link: StepLink): void {
  if (!navigationRef.isReady()) return;
  if (link.screen === "Settings") navigationRef.navigate("Settings", { section: link.section });
  else if (link.screen === "Library") navigationRef.navigate("Tabs", { screen: "Library", params: { segment: link.segment } });
  else if (link.screen === "Search") navigationRef.navigate("Tabs", { screen: "Search" });
  else if (link.screen === "Review") navigationRef.navigate("Tabs", { screen: "Review" });
  else navigationRef.navigate("Shared");
}

export function openGuide(): void {
  if (navigationRef.isReady()) navigationRef.navigate("Guide");
}
