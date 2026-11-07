import type { SubjectRef } from "@rivethub/contracts";
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
