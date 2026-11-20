import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";
import { fontsource } from "./fontsource";
import { stampIndexHtml, versionDocument } from "./scripts/web-version";

function webIdentity(): { version: string; commit: string } {
  const version = process.env["RIVETHUB_WEB_VERSION"] ?? (JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string }).version;
  const fromEnv = process.env["RIVETHUB_WEB_COMMIT"] ?? process.env["GITHUB_SHA"];
  if (fromEnv) return { version, commit: fromEnv };
  try {
    return { version, commit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim() };
  } catch {
    return { version, commit: "unknown" };
  }
}

/** Stamps index.html and version.json. `package-web` restamps both with the published release version. */
function rivethubWebVersion(): Plugin {
  const { version, commit } = webIdentity();
  return {
    name: "rivethub-web-version",
    transformIndexHtml(html) {
      return stampIndexHtml(html, version, commit);
    },
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "version.json", source: versionDocument(version, commit) });
    },
  };
}

const target = process.env["RIVETHUB_HUB_URL"] ?? "http://127.0.0.1:5174";
/** The hub refuses a write whose Origin is not its own, so the proxy presents the hub's origin. */
const hub = {
  target,
  changeOrigin: true,
  secure: false,
  configure: (proxy: { on(event: "proxyReq", handler: (req: { setHeader(name: string, value: string): void }) => void): void }) =>
    proxy.on("proxyReq", (req) => req.setHeader("origin", target)),
};

export default defineConfig({
  plugins: [react(), tailwindcss(), fontsource(), rivethubWebVersion()],
  // The hub's CSP is default-src 'self', which blocks data: URLs: never inline assets (fonts included).
  build: { assetsInlineLimit: 0 },
  server: { proxy: { "/api": hub, "/wiki": hub } },
  preview: { proxy: { "/api": hub, "/wiki": hub } },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: false,
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
