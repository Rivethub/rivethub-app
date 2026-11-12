import type { AuthSeam } from "@rivethub/client";

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
