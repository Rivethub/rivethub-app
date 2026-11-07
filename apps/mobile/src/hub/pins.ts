import type { SubjectRef } from "@rivethub/contracts";

export function isPinned(pins: readonly SubjectRef[], kind: SubjectRef["kind"], id: string): boolean {
  return pins.some((pin) => pin.kind === kind && pin.id === id);
}

export function togglePin(pins: readonly SubjectRef[], ref: SubjectRef): SubjectRef[] {
  if (isPinned(pins, ref.kind, ref.id)) return pins.filter((pin) => !(pin.kind === ref.kind && pin.id === ref.id));
  return [ref, ...pins];
}
