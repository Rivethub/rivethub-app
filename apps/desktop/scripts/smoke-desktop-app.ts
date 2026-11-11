// node scripts/smoke-desktop-app.ts --executable <RivetHub-*.AppImage | RivetHub-*.deb | linux-unpacked/rivethub> [--artifacts-dir <dir>]
// Launches a packaged RivetHub and checks it opens: the bundled rh reports the pinned version,
// and the window renders Today from sample data served from the bundled web build. Run it
// under xvfb-run on a headless box. Mirrors t3code's scripts/smoke-desktop-app.ts; release
// jobs run it so a build that packages but can't open fails before it is uploaded.
//
// The packaged app's fuses turn off --inspect, so Playwright's _electron.launch can't drive it.
// This starts the app itself with --remote-debugging-port=0 and attaches over CDP. An AppImage
// is started through its AppRun, which never adds --no-sandbox; it fails here on a host without
// unprivileged user namespaces, as it would for a user. The .deb and linux-unpacked binaries get
// --no-sandbox only on such a host, because their sandbox there relies on a root-owned setuid
// chrome-sandbox or the .deb's AppArmor profile, which an unpacked copy doesn't have.
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { access, mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { parseArgs, promisify } from "node:util";
import { chromium, type Browser, type Page } from "@playwright/test";

import { serveWebBuild } from "../e2e/webServer.ts";
import { bundledResources, EXECUTABLE_NAME } from "../src/bundle/layout.ts";
import { rhLock } from "../src/rh/rhLock.ts";

const STEP_TIMEOUT_MS = 60_000;
const exec = promisify(execFile);

const { values } = parseArgs({ options: { executable: { type: "string" }, "artifacts-dir": { type: "string" } } });
if (!values.executable) {
  throw new Error("Usage: smoke-desktop-app.ts --executable <RivetHub-*.AppImage | RivetHub-*.deb | linux-unpacked/rivethub> [--artifacts-dir <dir>]");
}
// pnpm runs package scripts in the package dir; resolve relative paths against where the user ran pnpm.
const invokedFrom = process.env["INIT_CWD"] ?? process.cwd();
const artifactsDir = path.resolve(invokedFrom, values["artifacts-dir"] ?? "desktop-launch-check");

/** Unpacks the package so its payload can be checked without FUSE or root. */
async function unpack(packagePath: string, into: string): Promise<{ appDir: string; command: string; isAppImage: boolean }> {
  if (packagePath.endsWith(".AppImage")) {
    await exec(packagePath, ["--appimage-extract"], { cwd: into, maxBuffer: 64 << 20 });
    const appDir = path.join(into, "squashfs-root");
    return { appDir, command: path.join(appDir, "AppRun"), isAppImage: true };
  }
  if (packagePath.endsWith(".deb")) {
    const debDir = path.join(into, "deb");
    await mkdir(debDir);
    await exec("ar", ["x", packagePath], { cwd: debDir });
    const dataTar = (await readdir(debDir)).find((name) => name.startsWith("data.tar"));
    if (!dataTar) throw new Error(`${packagePath} has no data.tar member`);
    await exec("tar", ["-xf", dataTar], { cwd: debDir });
    const appDir = path.join(debDir, "opt/RivetHub");
    return { appDir, command: path.join(appDir, EXECUTABLE_NAME), isAppImage: false };
  }
  return { appDir: path.dirname(packagePath), command: packagePath, isAppImage: false };
}

async function userNamespacesWork(): Promise<boolean> {
  return exec("unshare", ["-Ur", "true"]).then(
    () => true,
    () => false,
  );
}

/** Resolves with the DevTools websocket URL Chromium prints on stderr, or rejects if the app exits first. */
function devToolsEndpoint(app: ChildProcess): Promise<string> {
  return new Promise((resolve, reject) => {
    let stderr = "";
    const timer = setTimeout(() => reject(new Error(`no DevTools endpoint after ${STEP_TIMEOUT_MS} ms`)), STEP_TIMEOUT_MS);
    app.stderr!.on("data", (chunk: Buffer) => {
      process.stderr.write(chunk);
      stderr += chunk.toString();
      const match = /DevTools listening on (ws:\/\/\S+)/.exec(stderr);
      if (match) {
        clearTimeout(timer);
        resolve(match[1]!);
      }
    });
    app.once("exit", (code, signal) => {
      clearTimeout(timer);
      reject(new Error(`the app exited (${signal ?? code}) before DevTools was up`));
    });
  });
}

async function firstWindow(browser: Browser): Promise<Page> {
  const deadline = Date.now() + STEP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const page = browser.contexts().flatMap((context) => context.pages())[0];
    if (page) return page;
    await delay(250);
  }
  throw new Error(`no window after ${STEP_TIMEOUT_MS} ms`);
}

/** SIGTERM, then SIGKILL, to the app's whole process group, so no renderer or zygote outlives it. */
async function stop(app: ChildProcess): Promise<void> {
  if (app.exitCode !== null || app.signalCode !== null) return;
  const exited = once(app, "exit");
  const signalGroup = (signal: NodeJS.Signals) => {
    try {
      process.kill(-app.pid!, signal);
    } catch {
      // Already gone.
    }
  };
  signalGroup("SIGTERM");
  await Promise.race([exited, delay(10_000, undefined, { ref: false })]);
  signalGroup("SIGKILL");
}

const home = await mkdtemp(path.join(tmpdir(), "rivethub-desktop-smoke-"));
let step = "preparing";
let app: ChildProcess | undefined;
let browser: Browser | undefined;
let web: Awaited<ReturnType<typeof serveWebBuild>> | undefined;
try {
  step = "unpacking the package";
  const { appDir, command, isAppImage } = await unpack(path.resolve(invokedFrom, values.executable), home);
  const resources = bundledResources(path.join(appDir, "resources"));

  step = "running the bundled rh";
  await access(resources.rivethubMigrate);
  await access(resources.rhLicense);
  const { stdout } = await exec(resources.rh, ["version"]);
  const expected = `RivetHub v${rhLock.version}`;
  if (!stdout.startsWith(`${expected} `)) throw new Error(`bundled rh printed ${JSON.stringify(stdout.trim())}, expected ${expected}`);
  console.log(`bundled rh: ${stdout.trim()}`);

  step = "serving the bundled web build";
  web = await serveWebBuild(resources.web);

  step = "launching the app";
  const args = [`--user-data-dir=${path.join(home, "userdata")}`, "--ozone-platform=x11", "--remote-debugging-port=0"];
  if (!isAppImage && !(await userNamespacesWork())) {
    console.warn("This host can't create user namespaces; launching the unpacked binary with --no-sandbox.");
    args.push("--no-sandbox");
  }
  const env: Record<string, string | undefined> = {
    ...process.env,
    RIVETHUB_DESKTOP_URL: `${web.origin}/?sample`,
    XDG_CONFIG_HOME: path.join(home, ".config"),
    XDG_DATA_HOME: path.join(home, ".local/share"),
    XDG_CACHE_HOME: path.join(home, ".cache"),
  };
  // X11 only, so the host's Wayland session can't leak in.
  delete env["WAYLAND_DISPLAY"];
  // Set when this runs inside another AppImage; AppRun would then look for the app in that one.
  for (const name of ["APPDIR", "APPIMAGE", "ARGV0", "OWD"]) delete env[name];
  console.log(`launching ${path.relative(home, command)} ${args.join(" ")}`);
  app = spawn(command, args, { env, detached: true, stdio: ["ignore", "inherit", "pipe"] });
  const endpoint = await devToolsEndpoint(app);

  step = "attaching over CDP";
  browser = await chromium.connectOverCDP(endpoint, { timeout: STEP_TIMEOUT_MS });

  step = "waiting for the first window";
  const page = await firstWindow(browser);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    step = "waiting for Today to render";
    const heading = page.getByRole("heading", { level: 1 }).filter({ hasText: /Today your agents learned \d+ things/ });
    await heading.waitFor({ timeout: STEP_TIMEOUT_MS });
    if (new URL(page.url()).origin !== web.origin) throw new Error(`window is on ${page.url()}, expected ${web.origin}`);
    if (errors.length > 0) throw new Error(`page errors: ${errors.join("; ")}`);
    console.log(`window: "${await heading.textContent()}" on ${page.url()}`);
  } catch (error) {
    await mkdir(artifactsDir, { recursive: true });
    await page.screenshot({ path: path.join(artifactsDir, "window.png"), timeout: 10_000 }).catch(() => {});
    throw error;
  }
  console.log("Desktop launch check passed: bundled rh is the pinned version and the window rendered Today.");
} catch (error) {
  console.error(`Desktop launch check failed while ${step}.`);
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
  if (app) await stop(app);
  await web?.close();
  await rm(home, { recursive: true, force: true, maxRetries: 5 });
}
