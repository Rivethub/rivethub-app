import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { fontsource } from "./fontsource";

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
  plugins: [react(), tailwindcss(), fontsource()],
  // The hub's CSP is default-src 'self', which blocks data: URLs: never inline assets (fonts included).
  build: { assetsInlineLimit: 0 },
  server: { proxy: { "/api": hub, "/wiki": hub } },
  preview: { proxy: { "/api": hub, "/wiki": hub } },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: false,
  },
});
