import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { DesktopUpdateChannel } from "@rivethub/contracts";
import { z } from "zod";

const UpdateSettings = z.object({ channel: z.enum(["stable", "nightly"]) });

export const DEFAULT_UPDATE_CHANNEL: DesktopUpdateChannel = "stable";

/** A missing, unreadable or malformed file means stable: nightly is only ever an explicit opt-in. */
export function readUpdateChannel(file: string): DesktopUpdateChannel {
  try {
    const parsed = UpdateSettings.safeParse(JSON.parse(readFileSync(file, "utf8")));
    return parsed.success ? parsed.data.channel : DEFAULT_UPDATE_CHANNEL;
  } catch {
    return DEFAULT_UPDATE_CHANNEL;
  }
}

export function writeUpdateChannel(file: string, channel: DesktopUpdateChannel): void {
  const settings = UpdateSettings.parse({ channel });
  mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp`;
  writeFileSync(temp, JSON.stringify(settings));
  renameSync(temp, file);
}

export function isUpdateChannel(value: unknown): value is DesktopUpdateChannel {
  return UpdateSettings.shape.channel.safeParse(value).success;
}
