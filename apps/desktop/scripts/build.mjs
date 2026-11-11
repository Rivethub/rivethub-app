import { build, context } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/** Main and boot are separate files; boot requires main.cjs at runtime. The sandboxed preload must be self-contained. */
export const options = {
  absWorkingDir: root,
  entryPoints: { boot: "src/boot.ts", main: "src/main.ts", preload: "src/preload.ts" },
  outdir: "dist-electron",
  outExtension: { ".js": ".cjs" },
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  external: ["electron", "./main.cjs"],
  sourcemap: true,
  logLevel: "warning",
};

if (process.argv.includes("--watch")) {
  const ctx = await context(options);
  await ctx.watch();
} else {
  await build(options);
}
