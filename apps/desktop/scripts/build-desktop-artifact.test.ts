import { describe, expect, it } from "vitest";

import { updateChannelFor } from "../src/updates/updateFeed";
import { createBuildConfig } from "./build-desktop-artifact";

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
});
