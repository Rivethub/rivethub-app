import { describe, expect, it } from "vitest";
import { rhPaths } from "./rhPaths";

describe("rhPaths", () => {
  it("keeps state in ~/.rivethub and installs rh to ~/.local/bin", () => {
    expect(rhPaths({ HOME: "/home/u" })).toEqual({
      hubHome: "/home/u/.rivethub",
      config: "/home/u/.rivethub/config.yaml",
      env: "/home/u/.rivethub/.env",
      captureSpool: "/home/u/.rivethub/capture-spool",
      startLock: "/home/u/.rivethub/run/local-start.lock",
      installedRh: "/home/u/.local/bin/rh",
    });
  });

  it("moves state, not the installed binary, under RIVETHUB_HOME", () => {
    const paths = rhPaths({ HOME: "/home/u", RIVETHUB_HOME: "/srv/hub/" });
    expect(paths.hubHome).toBe("/srv/hub");
    expect(paths.config).toBe("/srv/hub/config.yaml");
    expect(paths.startLock).toBe("/srv/hub/run/local-start.lock");
    expect(paths.installedRh).toBe("/home/u/.local/bin/rh");
  });

  it("refuses a relative or escaping RIVETHUB_HOME, as rh does", () => {
    expect(() => rhPaths({ HOME: "/home/u", RIVETHUB_HOME: "hub" })).toThrow(/absolute/);
    expect(() => rhPaths({ HOME: "/home/u", RIVETHUB_HOME: "/srv/../etc" })).toThrow(/absolute/);
    expect(() => rhPaths({ HOME: "/home/u", RIVETHUB_HOME: "" })).toThrow(/RIVETHUB_HOME/);
  });

  it("refuses a relative or escaping HOME, as rh does", () => {
    expect(() => rhPaths({ HOME: "home/u" })).toThrow(/HOME/);
    expect(() => rhPaths({ HOME: "/home/u/../etc" })).toThrow(/HOME/);
  });
});
