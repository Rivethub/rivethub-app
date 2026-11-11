import { homedir } from "node:os";
import { isAbsolute, join, normalize, sep } from "node:path";

/** Where rh keeps its state, resolved the way `rh` resolves it (`crates/config/src/paths.rs`). */
export interface RhPaths {
  /** `$RIVETHUB_HOME`, or `~/.rivethub`. */
  hubHome: string;
  config: string;
  env: string;
  captureSpool: string;
  startLock: string;
  /** The stable copy of `rh` that the node, hooks and the recall MCP entry run. */
  installedRh: string;
}

export function rhPaths(env: NodeJS.ProcessEnv = process.env): RhPaths {
  const rawHome = env["HOME"] ?? homedir();
  if (!absoluteWithoutParents(rawHome)) {
    throw new Error("HOME must be an absolute directory path without '..' components");
  }
  const home = withoutTrailingSeparator(normalize(rawHome));
  const override = env["RIVETHUB_HOME"];
  if (override !== undefined && !absoluteWithoutParents(override)) {
    throw new Error("RIVETHUB_HOME must be an absolute directory path without '..' components");
  }
  const hubHome = override !== undefined ? withoutTrailingSeparator(normalize(override)) : join(home, ".rivethub");
  return {
    hubHome,
    config: join(hubHome, "config.yaml"),
    env: join(hubHome, ".env"),
    captureSpool: join(hubHome, "capture-spool"),
    startLock: join(hubHome, "run", "local-start.lock"),
    installedRh: join(home, ".local", "bin", "rh"),
  };
}

function withoutTrailingSeparator(path: string): string {
  return path.length > 1 && path.endsWith(sep) ? path.slice(0, -1) : path;
}

function absoluteWithoutParents(path: string): boolean {
  return isAbsolute(path) && !path.split(sep).includes("..");
}
