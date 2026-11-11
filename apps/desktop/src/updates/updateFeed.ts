import type { DesktopUpdateChannel } from "@rivethub/contracts";

/** Static files: get.rivethub.io/desktop/<channel>/latest-linux.yml (latest-linux-arm64.yml on arm64) beside the packages. */
export const UPDATE_FEED_BASE = "https://get.rivethub.io/desktop";

/** The channel's generic-provider directory. Updates come over https only. */
export function channelFeedUrl(base: string, channel: DesktopUpdateChannel): string {
  const url = new URL(base);
  if (url.protocol !== "https:") throw new Error(`The update feed must use https, got ${url.protocol}//${url.host}`);
  if (url.username || url.password) throw new Error("The update feed must not carry credentials");
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/${channel}/`;
  url.search = "";
  url.hash = "";
  return url.href;
}

/** How this copy of the app was installed, which decides what an update can do. */
export type UpdateInstall =
  | { kind: "appimage" }
  /** dpkg owns the files and only root may replace them, so a .deb install is told about updates, not given them. */
  | { kind: "deb" }
  | { kind: "unsupported"; reason: string };

/**
 * electron-builder writes `resources/package-type` ("deb") into the .deb, and the AppImage
 * runtime sets $APPIMAGE to the image's path. The .deb marker wins: $APPIMAGE is just an env var.
 */
export function detectInstall(input: { updatable: boolean; appImage: string | undefined; packageType: string | null }): UpdateInstall {
  if (!input.updatable) return { kind: "unsupported", reason: "Updates run only in the packaged app." };
  if (input.packageType?.trim() === "deb") return { kind: "deb" };
  if (input.appImage) return { kind: "appimage" };
  return { kind: "unsupported", reason: "Updates need the AppImage or the .deb package." };
}

/** The .deb in the channel's feed for a .deb install to download, or the feed directory if the feed lists none. */
export function debDownloadUrl(feedUrl: string, files: readonly { url: string }[]): string {
  const deb = files.find((file) => new URL(file.url, feedUrl).pathname.endsWith(".deb"));
  if (deb === undefined) return feedUrl;
  const url = new URL(deb.url, feedUrl);
  return url.protocol === "https:" ? url.href : feedUrl;
}
