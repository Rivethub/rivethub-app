import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { _electron, expect, test, type ElectronApplication } from "@playwright/test";

import { serveWebBuild } from "./webServer";

const desktopDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const webDist = path.resolve(desktopDir, "../web/dist");
const electronPath = createRequire(import.meta.url)("electron") as string;

let web: Awaited<ReturnType<typeof serveWebBuild>>;
let userData: string;

test.beforeAll(async () => {
  web = await serveWebBuild(webDist);
});
test.afterAll(async () => {
  await web.close();
});
test.beforeEach(() => {
  userData = mkdtempSync(path.join(tmpdir(), "rivethub-desktop-"));
});
test.afterEach(() => {
  rmSync(userData, { recursive: true, force: true });
});

const launch = (): Promise<ElectronApplication> =>
  _electron.launch({
    executablePath: electronPath,
    args: [desktopDir, `--user-data-dir=${userData}`],
    env: { ...process.env, RIVETHUB_DESKTOP_URL: `${web.origin}/?sample` },
  });

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

test("the renderer has no Node and sees only rivethub.relogin", async () => {
  const app = await launch();
  const page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");

  const surface = await page.evaluate(() => ({
    require: typeof (globalThis as Record<string, unknown>)["require"],
    process: typeof (globalThis as Record<string, unknown>)["process"],
    module: typeof (globalThis as Record<string, unknown>)["module"],
    rivethub: Object.keys((window as unknown as { rivethub: object }).rivethub),
    relogin: typeof (window as unknown as { rivethub: { relogin: unknown } }).rivethub.relogin,
  }));
  expect(surface).toEqual({ require: "undefined", process: "undefined", module: "undefined", rivethub: ["relogin"], relogin: "function" });

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

test("navigation and new windows stay on the node's origin", async () => {
  const app = await launch();
  const page = await app.firstWindow();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await app.evaluate(({ shell }) => {
    const opened: string[] = [];
    (globalThis as Record<string, unknown>)["openedExternally"] = opened;
    shell.openExternal = async (url) => {
      opened.push(url);
    };
  });

  const opened = await page.evaluate(() => window.open("https://example.com/") === null);
  expect(opened).toBe(true);
  await page.evaluate(() => {
    location.href = "https://example.com/";
  });
  await page.waitForTimeout(500);
  expect(new URL(page.url()).origin).toBe(web.origin);
  expect(app.windows()).toHaveLength(1);
  const handedOff = await app.evaluate(() => (globalThis as Record<string, unknown>)["openedExternally"]);
  expect(handedOff).toEqual(["https://example.com/", "https://example.com/"]);
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

  const second = spawn(electronPath, [desktopDir, `--user-data-dir=${userData}`], {
    env: { ...process.env, RIVETHUB_DESKTOP_URL: `${web.origin}/?sample` },
    stdio: "ignore",
  });
  const exitCode = await new Promise<number | null>((resolve) => second.on("exit", resolve));
  expect(exitCode).toBe(0);
  expect(app.windows()).toHaveLength(1);
  await app.close();
});
