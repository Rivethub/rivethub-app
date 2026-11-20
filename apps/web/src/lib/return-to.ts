/** Survives the gateway login page, which replaces the document with `/` and drops the path. */
export const RETURN_TO_KEY = "rivethub.returnTo";

const MEMORY_ITEM = /^\/(?:sessions|topics)\/[^/]+$/;

export function isMemoryItemPath(pathname: string): boolean {
  return MEMORY_ITEM.test(pathname);
}

/** A same-origin path. Protocol-relative URLs and `..` segments are not. */
export function isSafeReturn(href: string): boolean {
  if (!href.startsWith("/") || href.startsWith("//") || /[\r\n\\]/.test(href) || href.includes("://")) return false;
  const path = href.split(/[?#]/, 1)[0] ?? "";
  return path !== "" && !path.split("/").includes("..") && !path.includes("//");
}

/**
 * Called when the hub answers 401. Arming on every page exit would send a signed-in visitor who
 * loads `/` by hand back to the page they left.
 */
export function armReturn(href: string): void {
  if (!isSafeReturn(href)) return;
  const path = href.split(/[?#]/, 1)[0] ?? "";
  if (path === "/" && !href.includes("embed=1")) return;
  try {
    sessionStorage.setItem(RETURN_TO_KEY, href);
  } catch {
    // A private window that refuses storage stays where the login page sends it.
  }
}

/**
 * The login page always lands on `/`. That load is the only one that consumes the stored path.
 * Any other load drops a stale value so a later visit to Today does not bounce backward.
 */
export function takeReturn(pathname: string, searchStr: string): string | null {
  let saved: string | null = null;
  try {
    saved = sessionStorage.getItem(RETURN_TO_KEY);
  } catch {
    return null;
  }
  try {
    sessionStorage.removeItem(RETURN_TO_KEY);
  } catch {
    // The value was read. Leaving it would restore the same path twice.
  }
  if (pathname !== "/" || saved === null || !isSafeReturn(saved)) return null;
  const current = `${pathname}${searchStr}`;
  if (saved === current || saved === "/" || saved === "/?") return null;
  return saved;
}
