import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type { Plugin } from "vite";

const require = createRequire(import.meta.url);

/** The self-hosted font packages; each is SIL OFL 1.1, which requires its license to travel with the font files. */
export const FONT_PACKAGES = ["@fontsource/inter", "@fontsource/jetbrains-mono", "@fontsource-variable/source-serif-4"] as const;

const WOFF_FALLBACK = /,\s*url\([^)]*\.woff\)\s*format\(['"]woff['"]\)/g;

/**
 * Builds the self-hosted fonts for a Chromium-only app: drops fontsource's WOFF fallbacks,
 * which Chromium never fetches, and ships each font package's license beside the fonts.
 */
export function fontsource(): Plugin {
  return {
    name: "rivethub:fontsource",
    enforce: "pre",
    transform(code, id) {
      if (!id.includes("/@fontsource") || !id.split("?")[0]!.endsWith(".css")) return null;
      return { code: code.replace(WOFF_FALLBACK, ""), map: null };
    },
    generateBundle() {
      for (const name of FONT_PACKAGES) {
        const root = path.dirname(require.resolve(`${name}/package.json`));
        this.emitFile({
          type: "asset",
          fileName: `licenses/${name.replace("/", "__").replace("@", "")}.txt`,
          source: readFileSync(path.join(root, "LICENSE"), "utf8"),
        });
      }
    },
  };
}
