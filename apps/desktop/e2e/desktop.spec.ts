import { spawn } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { RivetHubDesktop } from "@rivethub/contracts";
import { _electron, expect, test, type ElectronApplication } from "@playwright/test";

import { serveWebBuild } from "./webServer";

const desktopDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const webDist = path.resolve(desktopDir, "../web/dist");
const electronPath = createRequire(import.meta.url)("electron") as string;

let web: Awaited<ReturnType<typeof serveWebBuild>>;
let fakeBin: string;
let userData: string;

// Stands in for xdg-open, which Electron runs for shell.openExternal: records each URL instead of opening a browser.
test.beforeAll(async () => {
  web = await serveWebBuild(webDist);
  fakeBin = mkdtempSync(path.join(tmpdir(), "rivethub-bin-"));
  writeFileSync(path.join(fakeBin, "xdg-open"), '#!/bin/sh\nprintf "%s\\n" "$1" >> "$RIVETHUB_TEST_OPENED"\n');
  chmodSync(path.join(fakeBin, "xdg-open"), 0o755);
});
test.afterAll(async () => {
  await web.close();
  rmSync(fakeBin, { recursive: true, force: true });
});
test.beforeEach(() => {
  userData = mkdtempSync(path.join(tmpdir(), "rivethub-desktop-"));
});
test.afterEach(() => {
  rmSync(userData, { recursive: true, force: true });
});

const openedLog = () => path.join(userData, "opened-externally.log");
const openedExternally = (): string[] => {
  try {
    return readFileSync(openedLog(), "utf8").split("\n").filter(Boolean);
  } catch {
    return [];
  }
};

/**
 * Electron on X11 (run the suite under `xvfb-run -a -s '-screen 0 1920x1080x24'`; its default 640x480 screen is smaller than the window) with
 * Wayland and ELECTRON_RUN_AS_NODE stripped, so the host's displays and
 * window manager don't leak into window bounds.
 */
const electronArgs = () => [desktopDir, `--user-data-dir=${userData}`, "--ozone-platform=x11"];
const launchEnv = (url = `${web.origin}/?sample`): Record<string, string> => {
  const env: Record<string, string | undefined> = {
    ...process.env,
    RIVETHUB_DESKTOP_URL: url,
    RIVETHUB_TEST_OPENED: openedLog(),
    PATH: `${fakeBin}${path.delimiter}${process.env["PATH"] ?? ""}`,
  };
  delete env["ELECTRON_RUN_AS_NODE"];
  delete env["WAYLAND_DISPLAY"];
  return Object.fromEntries(Object.entries(env).filter((e): e is [string, string] => e[1] !== undefined));
};

const launch = (url?: string): Promise<ElectronApplication> =>
  _electron.launch({ executablePath: electronPath, args: electronArgs(), env: launchEnv(url) });

test("renders Today from sample data on the node's origin", async () => {
  const app = await launch();
  const page = await app.firstWindow();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Today your agents learned \d+ things/);
  expect(new URL(page.url()).origin).toBe(web.origin);
  expect(errors).toEqual([]);
  await app.close();
});

test("the renderer has no Node and sees only rivethub.relogin and rivethub.updates", async () => {
  const app = await launch();
  const page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");

  const surface = await page.evaluate(() => ({
    require: typeof (globalThis as Record<string, unknown>)["require"],
    process: typeof (globalThis as Record<string, unknown>)["process"],
    module: typeof (globalThis as Record<string, unknown>)["module"],
    rivethub: Object.keys((window as unknown as { rivethub: object }).rivethub),
    relogin: typeof (window as unknown as { rivethub: { relogin: unknown } }).rivethub.relogin,
    updates: Object.keys((window as unknown as { rivethub: { updates: object } }).rivethub.updates),
  }));
  expect(surface).toEqual({
    require: "undefined",
    process: "undefined",
    module: "undefined",
    rivethub: ["relogin", "updates"],
    relogin: "function",
    updates: ["getState", "onState", "setChannel", "restartToUpdate"],
  });
  // An unpackaged run with no feed of its own never checks for updates.
  expect(await page.evaluate(() => (window as unknown as { rivethub: RivetHubDesktop }).rivethub.updates.getState())).toEqual({
    state: "disabled",
    channel: "stable",
    reason: "Updates run only in the packaged app.",
  });

  await app.close();
});

test("relogin reopens the window on the node's origin", async () => {
  const app = await launch();
  const page = await app.firstWindow();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.evaluate(() => history.pushState(null, "", "/review"));

  await expect(page).toHaveURL(`${web.origin}/review`);

  await page.evaluate(() => {
    void (window as unknown as { rivethub: { relogin: () => Promise<void> } }).rivethub.relogin();
  });
  await expect(page).toHaveURL(`${web.origin}/?sample`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Today your agents learned/);
  await app.close();
});

test("only a link the user clicks goes to the OS browser", async () => {
  const app = await launch();
  const page = await app.firstWindow();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  await page.evaluate(() => {
    for (const [id, target] of [["out", "_self"], ["popup", "_blank"]]) {
      const a = document.createElement("a");
      a.id = id!;
      a.target = target!;
      a.href = `https://example.com/${id}`;
      a.textContent = id!;
      document.body.prepend(a);
    }
  });
  await page.click("#popup");
  await expect.poll(openedExternally).toEqual(["https://example.com/popup"]);
  // The window cancels this navigation, so don't wait for it to finish.
  await page.click("#out", { noWaitAfter: true });
  await expect.poll(openedExternally).toEqual(["https://example.com/popup", "https://example.com/out"]);

  // Script alone, with no click behind it, opens nothing.
  expect(await page.evaluate(() => window.open("https://example.com/scripted-open") === null)).toBe(true);
  await page.evaluate(() => {
    location.href = "https://example.com/scripted-nav";
  });
  await page.waitForTimeout(500);
  expect(new URL(page.url()).origin).toBe(web.origin);
  expect(openedExternally()).toEqual(["https://example.com/popup", "https://example.com/out"]);
  expect(app.windows()).toHaveLength(1);
  await app.close();
});

test("a click spent on a node page can't open the OS browser from the next page", async () => {
  const app = await launch();
  const page = await app.firstWindow();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  await page.evaluate(() => {
    const a = document.createElement("a");
    a.id = "to-meta";
    a.href = "/meta-out";
    a.textContent = "to-meta";
    document.body.prepend(a);
  });
  // /meta-out refreshes to example.com at once and main blocks that navigation, so it never
  // finishes. Waiting for navigations after the click (the default) hangs whenever the refresh is
  // scheduled before that wait ends.
  await page.click("#to-meta", { noWaitAfter: true });
  await expect(page).toHaveURL(`${web.origin}/meta-out`);
  await page.waitForTimeout(500);
  expect(openedExternally()).toEqual([]);
  await app.close();
});

/** Types `key` from main with sendInputEvent, so it goes through before-input-event as a real key press does. */
const typeFromMain = (app: ElectronApplication, key: string) =>
  app.evaluate(({ BrowserWindow }, key) => {
    const contents = BrowserWindow.getAllWindows()[0]!.webContents;
    for (const type of ["keyDown", "char", "keyUp"] as const) contents.sendInputEvent({ type, keyCode: key });
  }, key);

test("typing a letter in a text box doesn't let the page open the OS browser (Space there still does, as Space on a focused link must)", async () => {
  const app = await launch();
  const page = await app.firstWindow();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  await page.evaluate(() => {
    const input = document.createElement("input");
    input.id = "box";
    input.addEventListener("keydown", () => window.open("https://example.com/from-typing"));
    document.body.prepend(input);
  });
  await page.click("#box");
  await page.waitForTimeout(1100);
  await typeFromMain(app, "a");
  await expect(page.locator("#box")).toHaveValue("a");
  await page.waitForTimeout(300);
  expect(openedExternally()).toEqual([]);
  await app.close();
});

test("a redirect or meta refresh off the node is dropped and opens nothing", async () => {
  const app = await launch();
  const page = await app.firstWindow();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  await page.evaluate(() => {
    location.href = "/redirect-out";
  });
  await page.waitForTimeout(500);
  expect(page.url()).toBe(`${web.origin}/?sample`);

  await page.evaluate(() => {
    location.href = "/meta-out";
  });
  await expect(page).toHaveURL(`${web.origin}/meta-out`);
  await page.waitForTimeout(500);
  expect(page.url()).toBe(`${web.origin}/meta-out`);
  expect(openedExternally()).toEqual([]);
  await app.close();
});

test("blob: and about:blank don't take the window off the node", async () => {
  const app = await launch();
  const page = await app.firstWindow();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  await page.evaluate(() => {
    location.href = URL.createObjectURL(new Blob(["<h1>not the node</h1>"], { type: "text/html" }));
  });
  await page.waitForTimeout(500);
  expect(new URL(page.url()).protocol).toBe("http:");

  await page.evaluate(() => {
    location.href = "about:blank";
  });
  await expect(page).toHaveURL(`${web.origin}/?sample`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Today your agents learned/);
  await app.close();
});

test("a node that redirects away on first load gets the can't-reach page, not the browser", async () => {
  const app = await launch(`${web.origin}/redirect-out`);
  const page = await app.firstWindow();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Can't reach your RivetHub node");
  await page.waitForTimeout(500);
  expect(openedExternally()).toEqual([]);
  expect(app.windows()).toHaveLength(1);
  await app.close();
});

test("a rejected RIVETHUB_DESKTOP_URL exits non-zero without a window", async () => {
  const child = spawn(electronPath, electronArgs(), { env: launchEnv("http://192.168.1.4:5174/"), stdio: ["ignore", "ignore", "pipe"] });
  let stderr = "";
  child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
  const exitCode = await new Promise<number | null>((resolve) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve(null);
    }, 15_000);
    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
  expect(exitCode).toBe(1);
  expect(stderr).toMatch(/RIVETHUB_DESKTOP_URL must point at a loopback host/);
});

test("a copy button puts the command on the system clipboard", async () => {
  const app = await launch(`${web.origin}/sessions/s-retention?sample`);
  const page = await app.firstWindow();
  await app.evaluate(({ clipboard }) => clipboard.writeText("before"));

  await page.getByRole("button", { name: "Copy resume" }).click();
  await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();
  expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe("claude --resume 4b81e0c2");
  await app.close();
});

test("restores window bounds and keeps a single instance", async () => {
  const first = await launch();
  await first.firstWindow();
  await first.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setBounds({ x: 60, y: 50, width: 1000, height: 700 }));
  await first.close();
  const saved = JSON.parse(readFileSync(path.join(userData, "window-state.json"), "utf8")) as { bounds: { width: number; height: number } };
  expect(saved.bounds).toMatchObject({ width: 1000, height: 700 });

  const app = await launch();
  await app.firstWindow();
  const size = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.getSize());
  expect(size).toEqual([1000, 700]);

  const second = spawn(electronPath, electronArgs(), { env: launchEnv(), stdio: "ignore" });
  const exitCode = await new Promise<number | null>((resolve) => second.on("exit", resolve));
  expect(exitCode).toBe(0);
  expect(app.windows()).toHaveLength(1);
  await app.close();
});
