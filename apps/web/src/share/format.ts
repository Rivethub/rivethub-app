/** The host of a server's origin, for showing a person. */
export function hostOf(origin: string): string {
  try {
    return new URL(origin).host;
  } catch {
    return origin;
  }
}

/** rh echoes a team server's origin as typed but lists it without the scheme, so compare on the host and path. */
export function sameServer(a: string, b: string): boolean {
  const bare = (origin: string) => origin.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  return bare(a) === bare(b);
}
