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

/** The host of an origin or URL, with or without its scheme, lowercased. */
const bareHost = (origin: string) => origin.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "").split(/[/?#]/)[0]!.toLowerCase();

export function sameHost(a: string, b: string): boolean {
  const host = bareHost(a);
  return host !== "" && host === bareHost(b);
}

export function sizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
