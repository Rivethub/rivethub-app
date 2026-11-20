import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { updateChannelFor } from "../src/updates/updateFeed";
import { APP_SPDX_LICENSE, createBuildConfig } from "./build-desktop-artifact";

describe("update feed in the build", () => {
  it("ships nightly versions on nightly and everything else on stable", () => {
    expect(updateChannelFor("0.2.0-nightly.20261111.1")).toBe("nightly");
    expect(updateChannelFor("0.2.0")).toBe("stable");
    expect(updateChannelFor("0.2.0-rc.1")).toBe("stable");
  });

  it("publishes to the channel's directory on get.rivethub.io", () => {
    const publish = (version: string) => createBuildConfig({ electronVersion: "45.2.3", outputDir: "/tmp/out", version }).publish;
    expect(publish("0.1.1")).toEqual({ provider: "generic", url: "https://get.rivethub.io/desktop/stable/" });
    expect(publish("0.2.0-nightly.20261111.1")).toEqual({ provider: "generic", url: "https://get.rivethub.io/desktop/nightly/" });
  });

  it("packs this repo's Apache-2.0 license into the app resources", async () => {
    const root = path.resolve(import.meta.dirname, "../../..");
    const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8")) as { license?: string };
    const license = await readFile(path.join(root, "LICENSE"), "utf8");
    expect(pkg.license).toBe(APP_SPDX_LICENSE);
    expect(APP_SPDX_LICENSE).toBe("Apache-2.0");
    expect(license).toContain("Apache License");
    expect(license).toContain("Version 2.0, January 2004");
    expect(license).toMatch(/^ *Copyright 2026 \S.+$/m);
    const resources = createBuildConfig({ electronVersion: "45.2.3", outputDir: "/tmp/out", version: "0.1.1" }).extraResources;
    expect(resources).toContainEqual({ from: path.join(root, "LICENSE"), to: "LICENSE" });
  });
});
