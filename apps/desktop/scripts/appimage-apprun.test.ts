// Runs the AppImage's AppRun against a stub app and a stub `unshare`. By default it tests
// linux/AppRun; with RIVETHUB_APPIMAGE=<RivetHub-*.AppImage> it tests the AppRun packed in that
// AppImage, as the release workflow does after each build.
import { execFile, spawnSync } from "node:child_process";
import { access, chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { EXECUTABLE_NAME } from "../src/bundle/layout";

const exec = promisify(execFile);
const desktopDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const appImage = process.env["RIVETHUB_APPIMAGE"];

let dir: string;
let appRun: string;

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "rivethub-apprun-"));
  if (appImage) {
    await exec(path.resolve(appImage), ["--appimage-extract", "AppRun"], { cwd: dir });
    appRun = path.join(dir, "squashfs-root/AppRun");
  } else {
    appRun = path.join(desktopDir, "linux/AppRun");
  }
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function writeScript(file: string, body: string): Promise<void> {
  await writeFile(file, `#!/bin/sh\n${body}\n`);
  await chmod(file, 0o755);
}

/** Runs AppRun with APPDIR set, as the AppImage runtime does, and `unshare` exiting with `unshareStatus`. */
async function runAppRun(name: string, unshareStatus: number, args: string[]) {
  const root = path.join(dir, name);
  const appDir = path.join(root, "appdir");
  const bin = path.join(root, "bin");
  await mkdir(appDir, { recursive: true });
  await mkdir(bin, { recursive: true });
  const appArgs = path.join(root, "app-args");
  const notified = path.join(root, "notified");
  await writeScript(path.join(appDir, EXECUTABLE_NAME), `printf '%s\\n' "$@" > '${appArgs}'`);
  await writeScript(path.join(bin, "unshare"), `exit ${unshareStatus}`);
  await writeScript(path.join(bin, "notify-send"), `printf '%s\\n' "$@" > '${notified}'`);
  const result = spawnSync(appRun, args, {
    encoding: "utf8",
    env: { PATH: `${bin}:/usr/bin:/bin`, APPDIR: appDir, HOME: root },
  });
  const read = (file: string) => readFile(file, "utf8").then((text) => text.split("\n").slice(0, -1), () => undefined);
  return { status: result.status, stderr: result.stderr, appArgs: await read(appArgs), notification: await read(notified) };
}

describe(`AppRun${appImage ? ` in ${path.basename(appImage)}` : ""}`, () => {
  it("refuses to start, and never runs the app, when user namespaces are unavailable", async () => {
    const run = await runAppRun("no-userns", 1, ["--some-flag"]);
    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain("can't run sandboxed from the AppImage on this system");
    expect(run.stderr).toContain("Install the .deb from https://rivethub.io");
    expect(run.appArgs).toBeUndefined();
    expect(run.notification?.join(" ")).toContain("Install the .deb from https://rivethub.io");
  });

  it("runs the app with the caller's arguments and no --no-sandbox when user namespaces work", async () => {
    const run = await runAppRun("userns", 0, ["--some-flag", "two words"]);
    expect(run.status).toBe(0);
    expect(run.appArgs).toEqual(["--some-flag", "two words"]);
    expect(run.notification).toBeUndefined();
  });

  // electron-builder writes the .deb's package-type marker into the shared app directory after
  // packing the AppImage; if that order changed, the AppImage would only ever notify.
  it.runIf(appImage)("updates in place: has app-update.yml for get.rivethub.io and no .deb marker", async () => {
    await exec(path.resolve(appImage!), ["--appimage-extract", "resources/*"], { cwd: dir });
    const resources = path.join(dir, "squashfs-root/resources");
    expect(await readFile(path.join(resources, "app-update.yml"), "utf8")).toMatch(/^url: https:\/\/get\.rivethub\.io\/desktop\/(stable|nightly)\/$/m);
    await expect(access(path.join(resources, "package-type"))).rejects.toThrow();
  });
});
