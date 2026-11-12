import { execFile } from "node:child_process";
import { lstat, readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { z } from "zod";

const execFileAsync = promisify(execFile);

const TIMEOUT_MS = 10_000;

const TokenPath = z.object({ path: z.string().min(1) });
const LoginCode = z.object({ code: z.string().min(1) });

export interface MintOptions {
  /** The rh binary: the bundled one in a packaged app, `rh` on PATH in development. */
  rh: string;
  env?: NodeJS.ProcessEnv;
}

/**
 * Mints a single-use login code (local-auth contract, section 2 Electron):
 * ask `rh auth token-path --json` where `local-owner.token` lives, check it is
 * a regular 0600 file, then `POST /api/auth/login-codes` with it as a Bearer.
 * The token stays in main; only the code leaves. Null when anything fails, so
 * the caller falls back to the node URL or tells the person.
 */
export async function mintLoginCode(origin: string, options: MintOptions): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(options.rh, ["auth", "token-path", "--json"], { env: options.env ?? process.env, timeout: TIMEOUT_MS });
    const token = await readOwnerToken(TokenPath.parse(JSON.parse(stdout)).path);
    const response = await fetch(new URL("/api/auth/login-codes", origin), {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`login-codes answered ${response.status}`);
    return LoginCode.parse(await response.json()).code;
  } catch (error) {
    console.error(`RivetHub: couldn't mint a login code: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

/** The token file must be a regular file, not a link, that only its owner can touch. */
async function readOwnerToken(file: string): Promise<string> {
  const info = await lstat(file);
  if (!info.isFile() || (info.mode & 0o077) !== 0) throw new Error("the owner token file must be a regular file with mode 0600");
  const token = (await readFile(file, "utf8")).trim();
  if (token === "") throw new Error("the owner token file is empty");
  return token;
}

/** Where the window goes: `/login#code=…` when a code was minted (the fragment never reaches a server log), else the node URL. */
export function signedInUrl(nodeUrl: URL, code: string | null): string {
  if (code === null) return nodeUrl.href;
  const login = new URL("/login", nodeUrl.origin);
  login.hash = `code=${encodeURIComponent(code)}`;
  return login.href;
}
