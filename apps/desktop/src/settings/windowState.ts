import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const WindowState = z.object({
  bounds: z.object({ x: z.number().int(), y: z.number().int(), width: z.number().int().min(1), height: z.number().int().min(1) }),
  maximized: z.boolean(),
});
export type WindowState = z.infer<typeof WindowState>;

export const DEFAULT_SIZE = { width: 1280, height: 820 };
export const MIN_SIZE = { width: 720, height: 520 };

/** A missing, unreadable or malformed file means "no saved state". */
export function readWindowState(file: string): WindowState | null {
  try {
    const parsed = WindowState.safeParse(JSON.parse(readFileSync(file, "utf8")));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function writeWindowState(file: string, state: WindowState): void {
  mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp`;
  writeFileSync(temp, JSON.stringify(state));
  renameSync(temp, file);
}

/** Saved bounds come back only if they still overlap a connected display by a usable margin. */
export function restorableBounds(saved: WindowState | null, displays: readonly Rect[]): Rect | null {
  if (saved === null) return null;
  const { bounds } = saved;
  const visible = displays.some((d) => {
    const w = Math.min(bounds.x + bounds.width, d.x + d.width) - Math.max(bounds.x, d.x);
    const h = Math.min(bounds.y + bounds.height, d.y + d.height) - Math.max(bounds.y, d.y);
    return w >= 100 && h >= 50;
  });
  if (!visible) return null;
  return {
    ...bounds,
    width: Math.max(bounds.width, MIN_SIZE.width),
    height: Math.max(bounds.height, MIN_SIZE.height),
  };
}
