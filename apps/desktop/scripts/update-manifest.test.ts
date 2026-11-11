// Packages a nightly-versioned AppImage and checks the update files electron-builder writes for it.
// It needs the staged rh, the apps/web build and dist-electron, so it runs only with
// RIVETHUB_PACKAGE_CHECK=1, after `pnpm dist:desktop:linux` as the release workflow does.
import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterAll, describe, expect, it } from "vitest";

import type { LinuxArch } from "./build-desktop-artifact";

const exec = promisify(execFile);
const NIGHTLY = "0.2.0-nightly.20261111.1";
const arch = process.arch as LinuxArch;
const manifest = arch === "arm64" ? "latest-linux-arm64.yml" : "latest-linux.yml";
const dirs: string[] = [];
afterAll(() => Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true }))));

describe.runIf(process.env["RIVETHUB_PACKAGE_CHECK"] === "1" && (arch === "x64" || arch === "arm64"))(`a ${NIGHTLY} AppImage`, () => {
  it("writes latest-linux*.yml for the nightly directory, and its app-update.yml names no channel", { timeout: 300_000 }, async () => {
    // builder-util hard-links instead of copying whenever VITEST is set, and the hard link
    // collides with afterPack's AppRun. Load electron-builder as a normal build would.
    delete process.env["VITEST"];
    const { LINUX_TARGETS, packageLinux } = await import("./build-desktop-artifact");
    const outputDir = await mkdtemp(path.join(tmpdir(), "rivethub-nightly-package-"));
    dirs.push(outputDir);
    const artifacts = await packageLinux({ arch, outputDir, version: NIGHTLY, targets: LINUX_TARGETS });
    const appImage = artifacts.find((file) => file.endsWith(".AppImage"));

    const ymls = (await readdir(outputDir)).filter((name) => name.endsWith(".yml") && name !== "builder-debug.yml");
    expect(ymls).toEqual([manifest]);
    expect(await readFile(path.join(outputDir, manifest), "utf8")).toMatch(new RegExp(`^version: ${NIGHTLY.replaceAll(".", "\\.")}$`, "m"));

    await exec(appImage!, ["--appimage-extract", "resources/app-update.yml"], { cwd: outputDir });
    const appUpdate = await readFile(path.join(outputDir, "squashfs-root/resources/app-update.yml"), "utf8");
    expect(appUpdate).toMatch(/^url: https:\/\/get\.rivethub\.io\/desktop\/nightly\/$/m);
    expect(appUpdate).not.toMatch(/^channel:/m);
  });
});
