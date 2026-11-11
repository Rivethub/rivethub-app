import { spawn } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { DesktopUpdateState, RivetHubDesktop } from "@rivethub/contracts";
import { _electron, expect, test, type ElectronApplication, type Page } from "@playwright/test";

import { publishRelease, serveUpdateFeed, type MockUpdateServer } from "./mockUpdateServer";
import { serveWebBuild } from "./webServer";

const desktopDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const webDist = path.resolve(desktopDir, "../web/dist");
const electronPath = createRequire(import.meta.url)("electron") as string;

/** Stands in for the new AppImage: when the updater starts it, it records its version and arguments. */
const NEW_APPIMAGE = '#!/bin/sh\nprintf "0.1.1 %s\\n" "$*" > "$RIVETHUB_TEST_RESTARTED"\n';

let web: Awaited<ReturnType<typeof serveWebBuild>>;
let work: string;
let feedRoot: string;
let feed: MockUpdateServer;

test.beforeAll(async () => {
  web = await serveWebBuild(webDist);
});
test.afterAll(async () => {
  await web.close();
});
test.beforeEach(() => {
  work = mkdtempSync(path.join(tmpdir(), "rivethub-updates-"));
  feedRoot = path.join(work, "feed");
  mkdirSync(feedRoot);
});
test.afterEach(async () => {
  await feed?.close();
  rmSync(work, { recursive: true, force: true });
});

/**
 * The app as version 0.1.0: the built main process with a package.json of that version, and
 * the dev-app-update.yml electron-updater reads its cache directory name from when unpackaged.
 */
function stageApp(): string {
  const appDir = path.join(work, "app");
  cpSync(path.join(desktopDir, "dist-electron"), path.join(appDir, "dist-electron"), { recursive: true });
  writeFileSync(
    path.join(appDir, "package.json"),
    JSON.stringify({ name: "rivethub", productName: "RivetHub", version: "0.1.0", main: "dist-electron/boot.cjs" }),
  );
  writeFileSync(path.join(appDir, "dev-app-update.yml"), "provider: generic\nurl: https://get.rivethub.io/desktop/stable\nupdaterCacheDirName: rivethub-updater\n");
  return appDir;
}

/** An AppImage install of 0.1.0 at a versioned path, as a user downloads it. */
function installAppImage(): string {
  const dir = path.join(work, "Applications");
  mkdirSync(dir);
  const appImage = path.join(dir, `RivetHub-0.1.0-${process.arch === "arm64" ? "arm64" : "x86_64"}.AppImage`);
  writeFileSync(appImage, "#!/bin/sh\nexit 0\n");
  chmodSync(appImage, 0o755);
  return appImage;
}

function launchOptions(env: Record<string, string>): { args: string[]; env: Record<string, string> } {
  const base: Record<string, string | undefined> = {
    ...process.env,
    RIVETHUB_DESKTOP_URL: `${web.origin}/?sample`,
    XDG_CACHE_HOME: path.join(work, "cache"),
    RIVETHUB_TEST_OPENED: path.join(work, "opened-externally.log"),
    RIVETHUB_TEST_RESTARTED: path.join(work, "restarted.log"),
    PATH: `${fakeXdgOpen()}${path.delimiter}${process.env["PATH"] ?? ""}`,
    ...env,
  };
  for (const name of ["ELECTRON_RUN_AS_NODE", "WAYLAND_DISPLAY", "APPIMAGE", "RIVETHUB_DESKTOP_PACKAGE_TYPE"]) {
    if (!(name in env)) delete base[name];
  }
  return {
    // The mock feed's certificate is self-signed.
    args: [stageApp(), `--user-data-dir=${path.join(work, "user-data")}`, "--ozone-platform=x11", "--ignore-certificate-errors"],
    env: Object.fromEntries(Object.entries(base).filter((e): e is [string, string] => e[1] !== undefined)),
  };
}

const launch = (env: Record<string, string>): Promise<ElectronApplication> =>
  _electron.launch({ executablePath: electronPath, ...launchOptions(env) });

/** Records each URL shell.openExternal would open (it runs xdg-open on Linux). */
function fakeXdgOpen(): string {
  const bin = path.join(work, "bin");
  if (!existsSync(bin)) {
    mkdirSync(bin);
    writeFileSync(path.join(bin, "xdg-open"), '#!/bin/sh\nprintf "%s\\n" "$1" >> "$RIVETHUB_TEST_OPENED"\n');
    chmodSync(path.join(bin, "xdg-open"), 0o755);
  }
  return bin;
}

/** Answers every update prompt with `button` and records its message. */
async function stubPrompts(app: ElectronApplication, button: number): Promise<void> {
  await app.evaluate(({ dialog }, response) => {
    const asked: string[] = [];
    (globalThis as { asked?: string[] }).asked = asked;
    dialog.showMessageBox = (async (...args: unknown[]) => {
      asked.push((args.at(-1) as { message: string }).message);
      return { response, checkboxChecked: false };
    }) as typeof dialog.showMessageBox;
  }, button);
}
const prompts = (app: ElectronApplication) => app.evaluate(() => (globalThis as { asked?: string[] }).asked ?? []);

const updateState = (page: Page) =>
  page.evaluate(() => (window as unknown as { rivethub: RivetHubDesktop }).rivethub.updates.getState());

async function settledState(page: Page, states: DesktopUpdateState["state"][]): Promise<DesktopUpdateState> {
  await expect.poll(async () => (await updateState(page)).state, { timeout: 20_000 }).toMatch(new RegExp(`^(${states.join("|")})$`));
  return updateState(page);
}

test("an AppImage of 0.1.0 downloads 0.1.1, verifies it, asks, and restarts into it in place", async () => {
  const { appImageName } = publishRelease(feedRoot, { channel: "stable", version: "0.1.1", appImage: NEW_APPIMAGE });
  feed = await serveUpdateFeed(feedRoot, { protocol: "https" });
  const appImage = installAppImage();
  const app = await launch({ RIVETHUB_DESKTOP_UPDATE_FEED: feed.feedBase, APPIMAGE: appImage });
  const page = await app.firstWindow();
  await stubPrompts(app, 1);
  feed.release();

  expect(await settledState(page, ["ready", "error"])).toEqual({ state: "ready", channel: "stable", version: "0.1.1" });
  expect(await prompts(app)).toEqual(["RivetHub 0.1.1 is ready"]);
  expect(feed.requests).toEqual(expect.arrayContaining([expect.stringMatching(/^\/desktop\/stable\/latest-linux(-arm64)?\.yml$/), `/desktop/stable/${appImageName}`]));
  expect(feed.requests.some((p) => p.endsWith(".deb"))).toBe(false);
  // "Later" left the old copy alone.
  expect(existsSync(appImage)).toBe(true);

  const closed = app.waitForEvent("close");
  void page.evaluate(() => (window as unknown as { rivethub: RivetHubDesktop }).rivethub.updates.restartToUpdate());
  await closed;

  const updated = path.join(path.dirname(appImage), appImageName);
  expect(existsSync(appImage)).toBe(false);
  expect(readFileSync(updated, "utf8")).toBe(NEW_APPIMAGE);
  await expect.poll(() => (existsSync(path.join(work, "restarted.log")) ? readFileSync(path.join(work, "restarted.log"), "utf8") : "")).toMatch(/^0\.1\.1/);
});

test("an install that fails keeps this copy running and takes the single-instance lock back", async () => {
  publishRelease(feedRoot, { channel: "stable", version: "0.1.1", appImage: NEW_APPIMAGE });
  feed = await serveUpdateFeed(feedRoot, { protocol: "https" });
  const appImage = installAppImage();
  const env = { RIVETHUB_DESKTOP_UPDATE_FEED: feed.feedBase, APPIMAGE: appImage };
  const app = await launch(env);
  const page = await app.firstWindow();
  await stubPrompts(app, 1);
  feed.release();
  expect(await settledState(page, ["ready", "error"])).toMatchObject({ state: "ready" });

  // The updater can't remove the old AppImage from a read-only directory.
  chmodSync(path.dirname(appImage), 0o555);
  try {
    await expect(page.evaluate(() => (window as unknown as { rivethub: RivetHubDesktop }).rivethub.updates.restartToUpdate())).rejects.toThrow(
      /couldn't be installed/,
    );
  } finally {
    chmodSync(path.dirname(appImage), 0o755);
  }
  expect(await updateState(page)).toMatchObject({ state: "error", message: expect.stringMatching(/couldn't be installed/) });

  const { args, env: secondEnv } = launchOptions(env);
  const second = spawn(electronPath, args, { env: secondEnv, stdio: "ignore" });
  const exited = await Promise.race([
    new Promise<number | null>((resolve) => second.on("exit", resolve)),
    new Promise<"still running">((resolve) => setTimeout(() => resolve("still running"), 15_000)),
  ]);
  if (exited === "still running") second.kill();
  expect(exited).toBe(0);
  expect(app.windows()).toHaveLength(1);
  await app.close();
});

test("a download whose sha512 doesn't match the feed is refused", async () => {
  publishRelease(feedRoot, { channel: "stable", version: "0.1.1", appImage: NEW_APPIMAGE, tamper: true });
  feed = await serveUpdateFeed(feedRoot, { protocol: "https" });
  const appImage = installAppImage();
  const app = await launch({ RIVETHUB_DESKTOP_UPDATE_FEED: feed.feedBase, APPIMAGE: appImage });
  const page = await app.firstWindow();
  await stubPrompts(app, 0);
  feed.release();

  const state = await settledState(page, ["ready", "error"]);
  expect(state).toMatchObject({ state: "error", channel: "stable" });
  expect(state.state === "error" && state.message).toMatch(/sha512/i);
  expect(await prompts(app)).toEqual([]);
  await expect(page.evaluate(() => (window as unknown as { rivethub: RivetHubDesktop }).rivethub.updates.restartToUpdate())).rejects.toThrow(/No update is ready/);
  await app.close();
  expect(readFileSync(appImage, "utf8")).toBe("#!/bin/sh\nexit 0\n");
});

test("an http:// feed is refused before any request", async () => {
  publishRelease(feedRoot, { channel: "stable", version: "0.1.1", appImage: NEW_APPIMAGE });
  feed = await serveUpdateFeed(feedRoot, { protocol: "http" });
  feed.release();
  const app = await launch({ RIVETHUB_DESKTOP_UPDATE_FEED: feed.feedBase, APPIMAGE: installAppImage() });
  const page = await app.firstWindow();

  const state = await settledState(page, ["ready", "error"]);
  expect(state).toMatchObject({ state: "error", message: expect.stringMatching(/must use https/) });
  expect(feed.requests).toEqual([]);
  await app.close();
});

test("an https feed that points the download at http:// is refused", async () => {
  const plain = await serveUpdateFeed(feedRoot, { protocol: "http" });
  plain.release();
  try {
    const { appImageName } = publishRelease(feedRoot, { channel: "stable", version: "0.1.1", appImage: NEW_APPIMAGE });
    publishRelease(feedRoot, { channel: "stable", version: "0.1.1", appImage: NEW_APPIMAGE, appImageUrl: `${plain.feedBase}/stable/${appImageName}` });
    feed = await serveUpdateFeed(feedRoot, { protocol: "https" });
    feed.release();
    const app = await launch({ RIVETHUB_DESKTOP_UPDATE_FEED: feed.feedBase, APPIMAGE: installAppImage() });
    const page = await app.firstWindow();

    expect(await settledState(page, ["ready", "error"])).toMatchObject({ state: "error" });
    expect(plain.requests).toEqual([]);
    await app.close();
  } finally {
    await plain.close();
  }
});

test("a .deb install is told about 0.1.1 and sent to the download, never downloads it", async () => {
  const { debName } = publishRelease(feedRoot, { channel: "stable", version: "0.1.1", appImage: NEW_APPIMAGE });
  feed = await serveUpdateFeed(feedRoot, { protocol: "https" });
  const app = await launch({ RIVETHUB_DESKTOP_UPDATE_FEED: feed.feedBase, RIVETHUB_DESKTOP_PACKAGE_TYPE: "deb" });
  const page = await app.firstWindow();
  await stubPrompts(app, 0);
  feed.release();

  const downloadUrl = `${feed.feedBase}/stable/${debName}`;
  expect(await settledState(page, ["manual", "error"])).toEqual({ state: "manual", channel: "stable", version: "0.1.1", downloadUrl });
  expect(await prompts(app)).toEqual(["RivetHub 0.1.1 is available"]);
  await expect.poll(() => (existsSync(path.join(work, "opened-externally.log")) ? readFileSync(path.join(work, "opened-externally.log"), "utf8") : "")).toBe(`${downloadUrl}\n`);
  expect(feed.requests.filter((p) => !p.endsWith(".yml"))).toEqual([]);
  await app.close();
});

test("nightly is opt-in, persists, and reads its own feed directory", async () => {
  publishRelease(feedRoot, { channel: "nightly", version: "0.2.0-nightly.20261111.1", appImage: NEW_APPIMAGE });
  feed = await serveUpdateFeed(feedRoot, { protocol: "https" });
  feed.release();
  const env = { RIVETHUB_DESKTOP_UPDATE_FEED: feed.feedBase, RIVETHUB_DESKTOP_PACKAGE_TYPE: "deb" };
  const first = await launch(env);
  const page = await first.firstWindow();
  await stubPrompts(first, 1);
  // Stable has no feed files here, so the startup check fails on stable.
  expect(await settledState(page, ["error", "idle"])).toMatchObject({ channel: "stable" });

  const setChannel = (channel: string) =>
    page.evaluate((c) => (window as unknown as { rivethub: RivetHubDesktop }).rivethub.updates.setChannel(c as "nightly"), channel);
  await expect(setChannel("beta")).rejects.toThrow(/stable or nightly/);
  await setChannel("nightly");
  expect(await settledState(page, ["manual", "error"])).toMatchObject({ state: "manual", channel: "nightly", version: "0.2.0-nightly.20261111.1" });
  expect(feed.requests).toContainEqual(expect.stringMatching(/^\/desktop\/nightly\/latest-linux/));
  await first.close();

  const second = await launch(env);
  const again = await second.firstWindow();
  await stubPrompts(second, 1);
  expect(await settledState(again, ["manual", "error"])).toMatchObject({ state: "manual", channel: "nightly" });
  await second.close();
});
