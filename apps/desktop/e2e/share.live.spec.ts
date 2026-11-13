/**
 * Drives the real Share and Receive screens in two Electron windows against
 * throwaway rh nodes: a sender, a receiver and a team drop server, with the
 * sessions seeded into the sender. It needs the nodes up, so it runs only when
 * SS10_NODES names the `nodes.json` that the kit's `up.sh` wrote:
 *
 *   SS10_NODES=/path/to/kit/nodes.json SS10_MEDIA=/path/to/screenshots \
 *     xvfb-run -a -s '-screen 0 1920x1080x24' pnpm --filter @rivethub/desktop exec playwright test share.live
 *
 * Each Electron window signs in through the app's own main process: it runs
 * `rh auth token-path --json` (RIVETHUB_RH names the binary), reads the owner
 * token, mints a login code and loads `/login#code=…`. Step-up goes through the
 * real "Sign in again" button on a session the node has aged past
 * `fresh_login_secs`. Only the plain-browser test mints a code itself, because
 * no main process is there to do it. Screenshots land in SS10_MEDIA. Playwright's
 * own video capture doesn't work for Electron windows, so the spec records the
 * whole X screen with ffmpeg to SS10_MEDIA/share-live.mp4 (size the screen to
 * the window: -screen 0 1280x820x24).
 */
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { _electron, chromium, expect, test, type ElectronApplication, type Page } from "@playwright/test";

interface Node {
  origin: string;
  home: string;
  stateDir: string;
  ownerTokenFile: string;
  log: string;
}
interface Kit {
  nodes: { A: Node; B: Node; T: Node };
  team: { origin: string; tokens: { phil: { token: string } } };
  freshLoginSecs: number;
  seeded: string;
}
interface Seeded {
  marker: string;
  sessions: { id: string; title: string; kind: string }[];
}

const nodesFile = process.env["SS10_NODES"];
const media = process.env["SS10_MEDIA"] ?? mkdtempSync(path.join(tmpdir(), "ss10-media-"));
const desktopDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const electronPath = createRequire(import.meta.url)("electron") as string;

test.skip(!nodesFile, "needs the throwaway nodes from the SS-10 kit (SS10_NODES)");
test.describe.configure({ mode: "serial" });
test.setTimeout(300_000);

const kit = (): Kit => JSON.parse(readFileSync(nodesFile!, "utf8")) as Kit;
const seeded = (): Seeded => JSON.parse(readFileSync(kit().seeded, "utf8")) as Seeded;
const titleOf = (kind: string) => seeded().sessions.find((s) => s.kind === kind)!.title;

const userData: string[] = [];
const apps: ElectronApplication[] = [];
const loginAt = new WeakMap<Page, number>();
let step = 0;

async function shot(page: Page, name: string): Promise<void> {
  step += 1;
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(media, `${String(step).padStart(2, "0")}-${name}.png`) });
}

/** A plain browser has no main process, so this test-only helper stands in: mint a code with the owner token, then load /login#code=. */
async function browserSignIn(page: Page, node: Node): Promise<void> {
  const token = readFileSync(node.ownerTokenFile, "utf8").trim();
  const response = await fetch(`${node.origin}/api/auth/login-codes`, { method: "POST", headers: { authorization: `Bearer ${token}` } });
  expect(response.status).toBe(200);
  const { code } = (await response.json()) as { code: string };
  await page.goto(`${node.origin}/login#code=${code}`);
  await page.waitForFunction(() => window.localStorage.getItem("rh-csrf") !== null);
  loginAt.set(page, Date.now());
  await page.evaluate(() => window.localStorage.setItem("rivethub.welcomed", "1"));
  await page.goto(`${node.origin}/`);
}

async function openApp(node: Node, label: string): Promise<{ app: ElectronApplication; page: Page }> {
  const dir = mkdtempSync(path.join(tmpdir(), `ss10-${label}-`));
  userData.push(dir);
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) if (value !== undefined && key !== "ELECTRON_RUN_AS_NODE" && key !== "WAYLAND_DISPLAY") env[key] = value;
  env["RIVETHUB_DESKTOP_URL"] = node.origin;
  env["RIVETHUB_RH"] = process.env["SS10_RH"] ?? "/home/phil/.cache/ss10/rt-target/debug/rh";
  env["RIVETHUB_STATE_DIR"] = node.stateDir;
  const app = await _electron.launch({ executablePath: electronPath, args: [desktopDir, `--user-data-dir=${dir}`, "--ozone-platform=x11"], env });
  apps.push(app);
  const page = await app.firstWindow();
  await page.waitForFunction(() => window.localStorage.getItem("rh-csrf") !== null && location.pathname !== "/login", undefined, { timeout: 30_000 });
  loginAt.set(page, Date.now());
  await page.evaluate(() => window.localStorage.setItem("rivethub.welcomed", "1"));
  await page.goto(`${node.origin}/`);
  return { app, page };
}

let recorder: ChildProcess | undefined;
test.beforeAll(() => {
  mkdirSync(media, { recursive: true });
  if (!process.env["DISPLAY"]) return;
  recorder = spawn(
    "ffmpeg",
    ["-y", "-loglevel", "error", "-f", "x11grab", "-framerate", "15", "-video_size", "1280x820", "-i", `${process.env["DISPLAY"]}+0,0`, "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", path.join(media, "share-live.mp4")],
    { stdio: ["pipe", "ignore", "inherit"] },
  );
});

test.afterAll(async () => {
  if (recorder) {
    const stopped = new Promise((resolve) => recorder!.once("exit", resolve));
    recorder.stdin!.write("q");
    await stopped;
  }
  for (const app of apps) await app.close().catch(() => {});
  for (const dir of userData) rmSync(dir, { recursive: true, force: true });
});

let code = "";

test("the browser build shows no Share or Receive", async () => {
  const { A } = kit().nodes;
  const browser = await chromium.launch({ executablePath: process.env["CHROMIUM_PATH"] ?? "/usr/bin/chromium", args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await browserSignIn(page, A);
  await expect(page.getByRole("link", { name: "Review" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Share", exact: true })).toHaveCount(0);
  await page.goto(`${A.origin}/share`);
  await expect(page.getByText("Sharing is in the RivetHub desktop app.")).toBeVisible();
  await shot(page, "browser-hides-share");
  await browser.close();
});

test("sender: pick, decide, sanitize, review flags, sign in to a team server, share", async () => {
  const { nodes, team, freshLoginSecs } = kit();
  const { app, page } = await openApp(nodes.A, "sender");
  // Sharing lives on one screen now: Shared in the sidebar, then the action.
  await page.getByRole("link", { name: "Shared", exact: true }).click();
  await page.getByRole("link", { name: "Share sessions", exact: true }).click();
  await shot(page, "share-choose-empty");

  const search = page.getByRole("searchbox", { name: /Find sessions to share/ });
  const picks = [
    ["Bluefin ledger migration", titleOf("name_and_project")],
    ["gateway drop-expiry test", titleOf("tool_output")],
    ["vendored parser README", titleOf("injection")],
    ["staging S3 upload credentials", titleOf("secret")],
    ["iterator adapter lifetime", titleOf("clean")],
  ] as const;
  for (const [query, title] of picks) {
    await search.fill(query);
    await page.getByRole("checkbox", { name: new RegExp(title.slice(0, 24)) }).check();
  }
  await search.fill("Bluefin ledger migration");
  await shot(page, "share-choose-picked");
  await page.getByRole("button", { name: "Continue" }).click();

  const decide = (title: string, option: string) => page.getByRole("group", { name: `Decision for ${title}` }).getByLabel(option).check({ force: true });
  const bluefin = titleOf("name_and_project");
  await decide(bluefin, "Redact");
  for (const term of ["Bluefin", "Dana Okafor"]) {
    await page.getByRole("textbox", { name: `Add a term to redact in ${bluefin}` }).fill(term);
    await page.keyboard.press("Enter");
  }
  const tool = titleOf("tool_output");
  await decide(tool, "Redact");
  await page.getByRole("checkbox", { name: `Drop tool outputs in ${tool}` }).check();
  await decide(titleOf("injection"), "Approve");
  await decide(titleOf("secret"), "Deny");
  await shot(page, "share-decide-partial");
  await expect(page.getByRole("button", { name: "Confirm decisions and sanitize" })).toBeDisabled();
  await decide(titleOf("clean"), "Approve");
  await shot(page, "share-decide-table");
  await page.getByRole("button", { name: "Confirm decisions and sanitize" }).click();

  await expect(page.getByText("What the scan did")).toBeVisible();
  await shot(page, "share-review-report");
  const flags = page.getByRole("listitem", { name: /^Flag \d+$/ });
  const flagCount = await flags.count();
  for (let i = 0; i < flagCount; i += 1) {
    const flag = flags.nth(i);
    await flag.getByLabel(i === 0 ? "Map" : i === 1 ? "Redact" : "Keep").check({ force: true });
    if (i === 0) {
      await flag.getByLabel("Term to replace").fill("collect.example.net");
      await flag.getByLabel("Placeholder").fill("HOST_1");
    }
  }
  await shot(page, "share-review-flags");
  const apply = page.getByRole("button", { name: /^Apply \d+ choices?$/ });
  if (await apply.isVisible()) await apply.click();
  await expect(page.getByText(/Every flag has a choice\./)).toBeVisible();
  await shot(page, "share-review-applied");
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByText("Where should it go?")).toBeVisible();
  await shot(page, "share-destination-before");
  await page.getByRole("button", { name: "Add a team server" }).click();
  await page.getByLabel("Server address").fill(team.origin);
  await page.getByLabel("Your token for that server").fill(team.tokens.phil.token);
  await shot(page, "share-destination-team-form");
  await page.locator("form").getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText(/signed in as/).first()).toBeVisible();
  await expect(page.getByLabel("Your token for that server")).toHaveCount(0);
  await shot(page, "share-destination-signed-in");
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByText("Ready to share")).toBeVisible();
  await shot(page, "share-confirm");

  const waitMs = Math.max(0, (loginAt.get(page)! + (freshLoginSecs + 2) * 1000) - Date.now());
  await page.waitForTimeout(waitMs);
  await page.getByRole("button", { name: "Share", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Confirm it's you first.");
  await shot(page, "share-step-up");
  await page.getByRole("button", { name: "Sign in again" }).click();
  await expect(page.getByText(/Signed in again/)).toBeVisible();
  await shot(page, "share-signed-in-again");
  await page.getByRole("button", { name: "Share", exact: true }).click();

  const output = page.getByRole("status", { name: "Share code" });
  await expect(output).toBeVisible();
  code = (await output.textContent()) ?? "";
  expect(code).toContain(new URL(team.origin).host);
  await shot(page, "share-done-code");
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }) + location.href + document.referrer);
  expect(stored).not.toContain(code.split("#")[1]!);
  await page.getByRole("button", { name: /Done, remove the code/ }).click();
  await expect(page.getByText(code)).toHaveCount(0);
  await shot(page, "share-code-gone");
  await app.close();
});

test("receiver: refuses a typo, trusts the sender, steps up on a flagged import, signs in again in place, imports", async () => {
  const { nodes, freshLoginSecs } = kit();
  expect(code).not.toBe("");
  const { app, page } = await openApp(nodes.B, "receiver");
  await page.getByRole("link", { name: "Shared", exact: true }).click();
  await page.getByRole("link", { name: "Enter a code", exact: true }).click();
  await shot(page, "receive-paste");

  const paste = page.getByLabel("Paste the code you were sent");
  await expect(paste).toHaveAttribute("type", "password");
  await paste.fill(code.slice(0, -3) + "AAA");
  await page.getByRole("button", { name: "Check the bundle" }).click();
  await expect(page.getByRole("alert")).toContainText("isn't a valid share code");
  await shot(page, "receive-bad-code");

  await paste.fill(code);
  await page.getByRole("button", { name: "Check the bundle" }).click();
  await expect(page.getByText("Where it came from")).toBeVisible();
  await expect(page.getByText(/from\s*phil/)).toBeVisible();
  await expect(page.getByText(titleOf("secret"))).toHaveCount(0);
  await shot(page, "receive-report");

  await page.getByLabel("The fingerprint matches").check();
  await page.getByRole("button", { name: /^Trust .*'s key$/ }).click();
  await expect(page.getByText(/Trusted\. Later bundles/)).toBeVisible();
  await shot(page, "receive-trusted-sender");

  const held = page.getByRole("listitem", { name: new RegExp(titleOf("injection").slice(0, 20)) });
  await expect(held.getByLabel("Findings")).toBeVisible();
  await shot(page, "receive-held-session");
  await expect(page.getByRole("button", { name: "Import", exact: true })).toBeDisabled();
  await held.getByLabel("Import", { exact: true }).check({ force: true });
  await shot(page, "receive-decided");
  await page.waitForTimeout(Math.max(0, loginAt.get(page)! + (freshLoginSecs + 2) * 1000 - Date.now()));
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Confirm it's you first.");
  await shot(page, "receive-step-up");

  const pageUrl = page.url();
  await page.getByRole("button", { name: "Sign in again" }).click();
  await expect(page.getByText(/Signed in again/)).toBeVisible();
  expect(page.url()).toBe(pageUrl);
  await expect(held.getByLabel("Import", { exact: true })).toBeChecked();
  await expect(paste).toHaveCount(0);
  await shot(page, "receive-signed-in-again");
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await expect(page.getByRole("list", { name: "Imported sessions" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Imported sessions" })).toContainText("verified");
  await shot(page, "receive-imported");

  await page.getByRole("link", { name: "Settings" }).click();
  await page.getByRole("link", { name: /Share keys/ }).click();
  await expect(page.getByLabel("Your fingerprint")).toBeVisible();
  await shot(page, "settings-share-keys");

  await page.goto(`${nodes.B.origin}/receive`);
  await page.getByLabel("Paste the code you were sent").fill(code);
  await page.getByRole("button", { name: "Check the bundle" }).click();
  await expect(page.getByRole("alert")).toContainText("already received");
  await shot(page, "receive-twice");
  await app.close();
});

test("the fixture's secret and canary never reach logs, app data or the drop server", async () => {
  const { nodes } = kit();
  const { marker } = seeded();
  const hits = (dirs: string[]) => {
    try {
      return execFileSync("grep", ["-rIl", "--", marker, ...dirs], { encoding: "utf8" }).split("\n").filter(Boolean);
    } catch {
      return [];
    }
  };
  const drops = path.join(nodes.T.home, ".rivethub");
  expect(hits([...userData, nodes.A.log, nodes.B.log, nodes.T.log, drops, nodes.B.home])).toEqual([]);
  expect(readdirSync(media).length).toBeGreaterThan(10);
  expect(statSync(media).isDirectory()).toBe(true);
});
