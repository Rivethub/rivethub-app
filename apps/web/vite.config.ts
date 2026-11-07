import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const hub = { target: process.env["RIVETHUB_HUB_URL"] ?? "https://127.0.0.1:5174", changeOrigin: true, secure: false };

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { proxy: { "/api": hub, "/wiki": hub } },
  preview: { proxy: { "/api": hub, "/wiki": hub } },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: false,
  },
});
