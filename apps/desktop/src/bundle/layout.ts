import path from "node:path";

/** The launcher's file name in the AppImage, the .deb and linux-unpacked. */
export const EXECUTABLE_NAME = "rivethub";

/** Where electron-builder's extraResources put each payload, under the app's resources directory. */
export const RESOURCE_DIRS = { rh: "rh", web: "web" } as const;

export interface BundledResources {
  /** The pinned rh that scripts/fetch-rh.ts staged. */
  rh: string;
  rivethubMigrate: string;
  /** rh is Apache-2.0; its LICENSE ships beside it. */
  rhLicense: string;
  /** The apps/web build, for rh to serve from `gateway.static_dir`. */
  web: string;
}

/** The bundled payload of a packaged app. Main passes `process.resourcesPath`. */
export function bundledResources(resourcesDir: string): BundledResources {
  const rhDir = path.join(resourcesDir, RESOURCE_DIRS.rh);
  return {
    rh: path.join(rhDir, "rh"),
    rivethubMigrate: path.join(rhDir, "rivethub-migrate"),
    rhLicense: path.join(rhDir, "LICENSE"),
    web: path.join(resourcesDir, RESOURCE_DIRS.web),
  };
}
