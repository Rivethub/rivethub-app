// pnpm dev:desktop [--sample]: the apps/web Vite server plus Electron pointed at it.
// Vite proxies /api to rh (RIVETHUB_HUB_URL); --sample opens the in-memory sample hub instead.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import net from "node:net";
import path from "node:path";
import { context } from "esbuild";

import { options } from "./build.mjs";

const require = createRequire(import.meta.url);
const electronPath = require("electron");
const root = options.absWorkingDir;
const port = Number(process.env["RIVETHUB_WEB_DEV_PORT"] ?? 5733);
const pageUrl = `http://127.0.0.1:${port}/${process.argv.includes("--sample") ? "?sample" : ""}`;

const children = new Set();
const track = (child) => {
  children.add(child);
  child.on("exit", () => children.delete(child));
  return child;
};

const webDir = path.resolve(root, "../web");
const viteBin = path.join(path.dirname(createRequire(path.join(webDir, "package.json")).resolve("vite/package.json")), "bin/vite.js");
const vite = track(
  spawn(process.execPath, [viteBin, "--host", "127.0.0.1", "--port", String(port), "--strictPort"], { cwd: webDir, stdio: "inherit" }),
);
vite.on("exit", (code) => shutdown(code ?? 1));

async function waitForPort() {
  for (;;) {
    const open = await new Promise((resolve) => {
      const socket = net.connect(port, "127.0.0.1", () => {
        socket.end();
        resolve(true);
      });
      socket.on("error", () => resolve(false));
    });
    if (open) return;
    await new Promise((r) => setTimeout(r, 200));
  }
}

let electron = null;
let shuttingDown = false;
let ctx = null;
function startElectron() {
  if (shuttingDown) return;
  const env = { ...process.env, RIVETHUB_DESKTOP_URL: pageUrl };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = track(spawn(electronPath, [root], { stdio: "inherit", env }));
  child.on("exit", () => {
    if (electron === child && !child.restarting) shutdown(0);
  });
  electron = child;
}
function restartElectron() {
  if (!electron) return startElectron();
  const old = electron;
  old.restarting = true;
  old.once("exit", startElectron);
  old.kill("SIGTERM");
}

function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) child.kill("SIGTERM");
  void Promise.resolve(ctx?.dispose()).finally(() => process.exit(code));
}
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

let firstBuild = true;
ctx = await context({
  ...options,
  plugins: [
    {
      name: "restart-electron",
      setup(build) {
        build.onEnd(async (result) => {
          if (result.errors.length) return;
          if (firstBuild) {
            firstBuild = false;
            await waitForPort();
            startElectron();
          } else {
            restartElectron();
          }
        });
      },
    },
  ],
});
await ctx.watch();
