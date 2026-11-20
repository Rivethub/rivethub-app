// Screenshots of the built app. Usage:
//   node scripts/screenshots.mjs <baseUrl> <outDir> [theme] [only-name-substring]
// CHROME overrides the browser binary.
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import puppeteer from "puppeteer-core";

const [base = "http://127.0.0.1:4317", out = "shots", theme = "everforest", only = ""] = process.argv.slice(2);
const chrome = process.env.CHROME ?? "/home/phil/.t3/tools/chrome-headless-shell/linux64/156.0.8078.70/chrome-headless-shell";

const desktop = { width: 1440, height: 900 };
const phone = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };

const shots = [
  ["desktop-today", desktop, "/"],
  ["desktop-review", desktop, "/review"],
  ["desktop-topic", desktop, "/topics/rh-08"],
  ["desktop-entity", desktop, "/entities/nas-01"],
  ["desktop-session-summary", desktop, "/sessions/s-retention?tab=summary"],
  ["desktop-converted-summary", desktop, "/sessions/codex%3Arestore-drill?sample&tab=summary"],
  ["desktop-settings", desktop, "/settings/connections"],
  ["desktop-account", desktop, "/settings/account"],
  ["desktop-welcome", desktop, "/welcome"],
  ["desktop-palette", desktop, "/", async (p) => { await p.keyboard.down("Control"); await p.keyboard.press("k"); await p.keyboard.up("Control"); await p.keyboard.type("nas"); }],
  ["phone-today", phone, "/"],
  ["phone-review", phone, "/review"],
  ["phone-entity", phone, "/entities/nas-01"],
  ["phone-entity-edit", phone, "/entities/nas-01", async (p) => { await p.click('button[aria-label="Edit Retention"]'); }],
  ["phone-library", phone, "/topics"],
  ["phone-session", phone, "/sessions/s-retention"],
  ["phone-search", phone, "/search?q=nas"],
  ["phone-settings", phone, "/settings/connections"],
  ["phone-switcher", phone, "/", async (p) => { await p.click('button[aria-label="Memory hub and settings"]'); }],
];

await mkdir(out, { recursive: true });
const browser = await puppeteer.launch({ executablePath: chrome, args: ["--no-sandbox", "--hide-scrollbars"] });
const failures = [];
for (const [name, viewport, path, act] of shots) {
  if (only && !name.includes(only)) continue;
  const page = await browser.newPage();
  page.on("pageerror", (e) => failures.push(`${name}: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && failures.push(`${name}: console ${m.text()}`));
  await page.setViewport(viewport);
  await page.evaluateOnNewDocument((t) => localStorage.setItem("rivethub.theme", t), theme);
  await page.goto(base + path, { waitUntil: "networkidle0" });
  await page.evaluate(() => document.fonts.ready);
  if (act) {
    await act(page);
    await new Promise((r) => setTimeout(r, 400));
  }
  await new Promise((r) => setTimeout(r, 250));
  const file = join(out, `${name}${theme === "everforest" ? "" : `-${theme}`}.png`);
  await page.screenshot({ path: file });
  console.log(file);
  await page.close();
}
await browser.close();
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
