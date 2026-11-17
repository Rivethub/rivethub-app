import { ReauthRequiredError, type AuthSeam } from "@rivethub/client";
import { desktopBridge } from "../lib/desktop";

/** Where rh's login page leaves the session's CSRF token (rivethub-runtime CONTRACT note 147). The session cookie itself is httpOnly. */
export const CSRF_STORAGE_KEY = "rh-csrf";

/** Every call to rh from a cookie session carries the CSRF token, reads included. */
export const sessionAuth: AuthSeam = {
  headers() {
    try {
      const token = window.localStorage.getItem(CSRF_STORAGE_KEY);
      return token ? { "x-rh-csrf": token } : {};
    } catch {
      return {};
    }
  },
};

/**
 * Trades a one-time login code for a fresh session without leaving the page: the response sets the session cookie
 * and its body carries the new CSRF token. Nothing is stored but that token; the code is never kept.
 */
export async function signInWithCode(code: string): Promise<void> {
  const response = await fetch("/api/auth/session", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code }),
  });
  if (!response.ok) throw new Error(`rh answered ${response.status}`);
  const body: unknown = await response.json();
  const csrf = typeof body === "object" && body !== null ? (body as { csrf?: unknown }).csrf : undefined;
  if (typeof csrf !== "string" || csrf === "") throw new Error("rh sent no CSRF token");
  try {
    window.localStorage.setItem(CSRF_STORAGE_KEY, csrf);
  } catch {
    throw new Error("the CSRF token couldn't be stored");
  }
}

const STALE_SIGN_IN = "This window's sign-in is more than five minutes old, so that was refused. Open the RivetHub desktop app, which can refresh it, or run rh open and try again.";
const REFRESH_FAILED = "Couldn't refresh the sign-in. Run rh open, or check that rh is running.";

/**
 * Account routes keep rh's freshness guard. A desktop window can mint a new session and retry once;
 * a plain browser cannot, and then the person gets a sentence instead of the route path.
 */
export async function withFreshLogin<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (!(error instanceof ReauthRequiredError)) throw error;
    const bridge = desktopBridge();
    if (!bridge) throw new Error(STALE_SIGN_IN);
    try {
      const code = await bridge.relogin();
      if (!code) throw new Error(REFRESH_FAILED);
      await signInWithCode(code);
    } catch (refreshError) {
      if (refreshError instanceof Error && refreshError.message === REFRESH_FAILED) throw refreshError;
      throw new Error(REFRESH_FAILED);
    }
    try {
      return await run();
    } catch (again) {
      if (again instanceof ReauthRequiredError) throw new Error(STALE_SIGN_IN);
      throw again;
    }
  }
}
