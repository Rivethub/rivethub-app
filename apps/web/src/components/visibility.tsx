import type { Visibility } from "@rivethub/contracts";
import { useMe } from "../client/queries";

export function VisibilityName({ value }: { value: Visibility }) {
  const me = useMe();
  return <>{value.kind === "private" ? "Private" : me.data?.spaces.find((s) => s.id === value.space)?.name ?? "Shared space"}</>;
}
