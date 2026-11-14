import { subjectLabel } from "@rivethub/client-runtime/format";
import type { SubjectRef } from "@rivethub/contracts";
import { useEntities } from "../client/queries";

/** A single neutral label, resolved from the same hub data as the Entities library. */
export function SubjectType({ subject }: { subject: SubjectRef }) {
  const entities = useEntities().data ?? [];
  return <span className="text-[12px] text-muted-foreground">{subjectLabel(subject, entities)}</span>;
}
