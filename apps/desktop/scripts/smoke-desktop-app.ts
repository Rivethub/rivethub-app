// node scripts/smoke-desktop-app.ts --executable <RivetHub-*.AppImage | linux-unpacked/rivethub> [--artifacts-dir <dir>]
// Launches a packaged RivetHub and checks it opens: the bundled rh reports the pinned version,
// and the window renders Today from sample data served from the bundled web build. Run it
// under xvfb-run on a headless box. Mirrors t3code's scripts/smoke-desktop-app.ts; release
// jobs run it so a build that packages but can't open fails before it is uploaded.
import { execFile } from "node:child_process";
import { access, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { parseArgs, promisify } from "node:util";
import { _electron, type ElectronApplication } from "@playwright/test";

import { serveWebBuild } from "../e2e/webServer.ts";
import { bundledResources, EXECUTABLE_NAME } from "../src/bundle/layout.ts";
import { rhLock } from "../src/rh/rhLock.ts";

const STEP_TIMEOUT_MS = 60_000;
const exec = promisify(execFile);

const { values } = parseArgs({ options: { executable: { type: "string" }, "artifacts-dir": { type: "string" } } });
if (!values.executable) throw new Error("Usage: smoke-desktop-app.ts --executable <RivetHub-*.AppImage | linux-unpacked/rivethub> [--artifacts-dir <dir>]");
// pnpm runs package scripts in the package dir; resolve relative paths against where the user ran pnpm.
const invokedFrom = process.env["INIT_CWD"] ?? process.cwd();
const artifactsDir = path.resolve(invokedFrom, values["artifacts-dir"] ?? "desktop-launch-check");

const home = await mkdtemp(path.join(tmpdir(), "rivethub-desktop-smoke-"));
let step = "preparing";
let app: ElectronApplication | undefined;
let web: Awaited<ReturnType<typeof serveWebBuild>> | undefined;
try {
  let executable = path.resolve(invokedFrom, values.executable);
  if (executable.endsWith(".AppImage")) {
    // Unpacking checks the AppImage's own payload without needing FUSE on the runner.
    step = "extracting the AppImage";
    await exec(executable, ["--appimage-extract"], { cwd: home, maxBuffer: 64 << 20 });
    executable = path.join(home, "squashfs-root", EXECUTABLE_NAME);
  }
  const resources = bundledResources(path.join(path.dirname(executable), "resources"));

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
  const env: Record<string, string | undefined> = {
    ...process.env,
    RIVETHUB_DESKTOP_URL: `${web.origin}/?sample`,
    XDG_CONFIG_HOME: path.join(home, ".config"),
    XDG_DATA_HOME: path.join(home, ".local/share"),
    XDG_CACHE_HOME: path.join(home, ".cache"),
  };
  // X11 only, so the host's Wayland session can't leak in; never as plain Node.
  delete env["WAYLAND_DISPLAY"];
  delete env["ELECTRON_RUN_AS_NODE"];
  app = await _electron.launch({
    executablePath: executable,
    // Linux CI runners don't allow the Chromium sandbox's user namespaces.
    args: [`--user-data-dir=${path.join(home, "userdata")}`, "--ozone-platform=x11", "--no-sandbox"],
    env: Object.fromEntries(Object.entries(env).filter((e): e is [string, string] => e[1] !== undefined)),
    timeout: STEP_TIMEOUT_MS,
  });

  step = "waiting for the first window";
  const page = await app.firstWindow({ timeout: STEP_TIMEOUT_MS });
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
  if (app) {
    // A hung app never finishes closing; kill it so the job doesn't wait on its timeout.
    // Playwright drops the process handle once the app closes, so read it first.
    const child = app.process();
    await Promise.race([app.close().catch(() => {}), delay(10_000, undefined, { ref: false })]);
    child.kill("SIGKILL");
  }
  await web?.close();
  await rm(home, { recursive: true, force: true, maxRetries: 5 });
}
