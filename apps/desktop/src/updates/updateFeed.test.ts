import { describe, expect, it } from "vitest";

import { channelFeedUrl, debDownloadUrl, detectInstall, UPDATE_FEED_BASE } from "./updateFeed";

describe("channelFeedUrl", () => {
  it("puts each channel in its own directory on get.rivethub.io", () => {
    expect(channelFeedUrl(UPDATE_FEED_BASE, "stable")).toBe("https://get.rivethub.io/desktop/stable/");
    expect(channelFeedUrl(UPDATE_FEED_BASE, "nightly")).toBe("https://get.rivethub.io/desktop/nightly/");
    expect(channelFeedUrl("https://127.0.0.1:8443/desktop//?x=1#y", "stable")).toBe("https://127.0.0.1:8443/desktop/stable/");
  });

  it.each(["http://get.rivethub.io/desktop", "file:///srv/desktop", "ftp://get.rivethub.io/desktop"])("refuses %s", (base) => {
    expect(() => channelFeedUrl(base, "stable")).toThrow(/must use https/);
  });

  it("refuses credentials in the feed URL", () => {
    expect(() => channelFeedUrl("https://user:pass@get.rivethub.io/desktop", "stable")).toThrow(/credentials/);
  });
});

describe("detectInstall", () => {
  it("updates an AppImage in place", () => {
    expect(detectInstall({ updatable: true, appImage: "/home/u/RivetHub-0.1.0-x86_64.AppImage", packageType: null })).toEqual({ kind: "appimage" });
  });

  it("only notifies a .deb install, even with $APPIMAGE set", () => {
    expect(detectInstall({ updatable: true, appImage: undefined, packageType: "deb\n" })).toEqual({ kind: "deb" });
    expect(detectInstall({ updatable: true, appImage: "/tmp/x.AppImage", packageType: "deb" })).toEqual({ kind: "deb" });
  });

  it("turns updates off for dev builds and unpacked copies", () => {
    expect(detectInstall({ updatable: false, appImage: "/tmp/x.AppImage", packageType: "deb" }).kind).toBe("unsupported");
    expect(detectInstall({ updatable: true, appImage: undefined, packageType: null }).kind).toBe("unsupported");
    expect(detectInstall({ updatable: true, appImage: undefined, packageType: "rpm" }).kind).toBe("unsupported");
  });
});

describe("debDownloadUrl", () => {
  const feed = "https://get.rivethub.io/desktop/stable/";

  it("links the feed's .deb", () => {
    const files = [{ url: "RivetHub-0.1.1-x86_64.AppImage" }, { url: "RivetHub-0.1.1-amd64.deb" }];
    expect(debDownloadUrl(feed, files)).toBe("https://get.rivethub.io/desktop/stable/RivetHub-0.1.1-amd64.deb");
  });

  it("falls back to the feed directory when the feed lists no .deb or an http one", () => {
    expect(debDownloadUrl(feed, [{ url: "RivetHub-0.1.1-x86_64.AppImage" }])).toBe(feed);
    expect(debDownloadUrl(feed, [{ url: "http://evil.example/RivetHub-0.1.1-amd64.deb" }])).toBe(feed);
  });
});
