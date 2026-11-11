/**
 * Mints a single-use login code for the window (local-auth contract, §2
 * Electron, steps 2 and 3): read `<state_dir>/local-owner.token` after checking
 * it is a regular 0600 file, then `POST /api/auth/login-codes` with it as a
 * Bearer. The token stays in main.
 *
 * rh has no auth routes until SS-15a, so this returns null and the window
 * opens the node URL as is. PR 5 (backend manager) wires it to rh.
 */
export async function mintLoginCode(_origin: string): Promise<string | null> {
  return null;
}

/** Where the window goes: `/login#code=…` when a code was minted (the fragment never reaches a server log), else the node URL. */
export function signedInUrl(nodeUrl: URL, code: string | null): string {
  if (code === null) return nodeUrl.href;
  const login = new URL("/login", nodeUrl.origin);
  login.hash = `code=${encodeURIComponent(code)}`;
  return login.href;
}
