import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { DesktopUpdateChannel } from "@rivethub/contracts";
import { z } from "zod";

const UpdateSettings = z.object({ channel: z.enum(["stable", "nightly"]) });

/**
 * The saved channel. A missing, unreadable or malformed file means `buildChannel`, the channel the
 * running build was published to, so a nightly build keeps getting nightlies and a stable build
 * only gets nightly after an explicit opt-in.
 */
export function readUpdateChannel(file: string, buildChannel: DesktopUpdateChannel): DesktopUpdateChannel {
  try {
    const parsed = UpdateSettings.safeParse(JSON.parse(readFileSync(file, "utf8")));
    return parsed.success ? parsed.data.channel : buildChannel;
  } catch {
    return buildChannel;
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
