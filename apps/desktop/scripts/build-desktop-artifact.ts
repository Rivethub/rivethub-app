// pnpm dist:desktop:linux [--arch x64|arm64] [--output-dir <dir>] [--version <semver>]
// Stages the pinned rh for the target arch, builds apps/web and apps/desktop, and packages
// a Linux AppImage and .deb with electron-builder. Mirrors t3code's scripts/build-desktop-artifact.ts:
// the app is staged in a temp dir with only its bundle and a generated package.json, and
// electron-builder runs against that stage with the config below.
import { spawn } from "node:child_process";
import { once } from "node:events";
import { chmod, copyFile, cp, lstat, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { Arch, build, Platform, type AfterPackContext, type Configuration } from "electron-builder";

import { EXECUTABLE_NAME, RESOURCE_DIRS } from "../src/bundle/layout.ts";
import { rhTargetFor } from "../src/rh/rhLock.ts";
import { channelFeedUrl, UPDATE_FEED_BASE, updateChannelFor } from "../src/updates/updateFeed.ts";

const desktopDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoRoot = path.resolve(desktopDir, "../..");

export const DESKTOP_APP_ID = "io.rivethub.desktop";
export const PRODUCT_NAME = "RivetHub";
export const LINUX_TARGETS = ["AppImage", "deb"] as const;
export const LINUX_ARCHES = ["x64", "arm64"] as const;
/** Replaces electron-builder's AppRun in the AppImage; see the script's header for why. */
const APP_RUN_SOURCE = path.join(desktopDir, "linux/AppRun");
export type LinuxArch = (typeof LINUX_ARCHES)[number];

/** Repo-relative payloads copied into the app's resources directory, as t3code's DESKTOP_EXTRA_RESOURCES. */
export const DESKTOP_EXTRA_RESOURCES = [
  { from: "apps/desktop/prod-resources/rh", to: RESOURCE_DIRS.rh },
  { from: "apps/web/dist", to: RESOURCE_DIRS.web },
] as const;

/**
 * One package per library the Electron 45 binaries link (readelf NEEDED), plus xdg-utils for
 * shell.openExternal. Debian 13 and Ubuntu 24.04 renamed some for 64-bit time; the old names
 * stay as alternatives for Ubuntu 22.04 and Debian 12.
 */
export const DEB_DEPENDS = [
  "libasound2t64 | libasound2",
  "libatk-bridge2.0-0t64 | libatk-bridge2.0-0",
  "libatk1.0-0t64 | libatk1.0-0",
  "libatspi2.0-0t64 | libatspi2.0-0",
  "libcairo2",
  "libcups2t64 | libcups2",
  "libdbus-1-3",
  "libdrm2",
  "libexpat1",
  "libgbm1",
  "libglib2.0-0t64 | libglib2.0-0",
  "libgtk-3-0t64 | libgtk-3-0",
  "libnspr4",
  "libnss3",
  "libpango-1.0-0",
  "libudev1",
  "libx11-6",
  "libxcb1",
  "libxcomposite1",
  "libxdamage1",
  "libxext6",
  "libxfixes3",
  "libxkbcommon0",
  "libxrandr2",
  "xdg-utils",
];

export function createBuildConfig(options: { electronVersion: string; outputDir: string; version: string }): Configuration {
  return {
    appId: DESKTOP_APP_ID,
    productName: PRODUCT_NAME,
    artifactName: "RivetHub-${version}-${arch}.${ext}",
    electronVersion: options.electronVersion,
    directories: { output: options.outputDir },
    files: ["package.json", "dist-electron/*.cjs"],
    extraResources: DESKTOP_EXTRA_RESOURCES.map(({ from, to }) => ({ from: path.join(repoRoot, from), to })),
    // The bundle has no node_modules; nothing to rebuild.
    npmRebuild: false,
    // Writes latest-linux.yml (latest-linux-arm64.yml on arm64) beside the packages, for upload to
    // this channel's directory, and resources/app-update.yml. The app picks the directory at run
    // time from the user's channel setting.
    publish: { provider: "generic", url: channelFeedUrl(UPDATE_FEED_BASE, updateChannelFor(options.version)) },
    // The channel is the feed directory. Left on, electron-builder would name a prerelease's
    // manifest after its tag (nightly-linux.yml) and pin app-update.yml to that channel, while the
    // app always asks for latest-linux.yml.
    detectUpdateChannel: false,
    // The static AppImage runtime, so hosts with only FUSE 3 (Ubuntu 22.04 and later) don't need libfuse2.
    toolsets: { appimage: "1.0.3" },
    afterPack,
    // https://www.electronjs.org/docs/latest/tutorial/fuses. Embedded asar integrity validation is macOS and Windows only.
    electronFuses: {
      runAsNode: false,
      enableNodeOptionsEnvironmentVariable: false,
      enableNodeCliInspectArguments: false,
      onlyLoadAppFromAsar: true,
      enableCookieEncryption: true,
      // The window loads rh over loopback http, never file://.
      grantFileProtocolExtraPrivileges: false,
    },
    linux: {
      executableName: EXECUTABLE_NAME,
      icon: path.join(repoRoot, "apps/web/public/icons/icon-512.png"),
      category: "Utility",
      synopsis: "Memory for your coding agents",
      description: "RivetHub captures sessions from your coding agents, keeps what they learned, and serves it back to them.",
      maintainer: "RivetHub <rivetphilbot@gmail.com>",
      vendor: "RivetHub",
      // Names the launcher rivethub.desktop with StartupWMClass=rivethub, the WM_CLASS and Wayland
      // app_id Electron takes from package.json's desktopName, so docks match windows to it.
      syncDesktopName: true,
    },
    // No tray icon, so not electron-builder's default libappindicator3-1 recommend.
    deb: {
      depends: DEB_DEPENDS,
      recommends: [],
      packageCategory: "utils",
      // afterPack's AppRun is for the AppImage only.
      fpm: ["--exclude", `opt/${PRODUCT_NAME}/AppRun`],
    },
  };
}

async function afterPack(context: AfterPackContext): Promise<void> {
  // The AppImage target writes its generated AppRun into its stage and then copies the app
  // directory over it, so this AppRun is the one that ships in the AppImage.
  await copyFile(APP_RUN_SOURCE, path.join(context.appOutDir, "AppRun"));
  await chmod(path.join(context.appOutDir, "AppRun"), 0o755);
  // Electron's Linux zips can carry group- or world-writable files, and electron-builder copies
  // their modes into the .deb and AppImage. Same fix as t3code's scripts/linux-after-pack.ts.
  await removeSharedWriteAccess(context.appOutDir);
}

/** Walks by hand: a recursive readdir would follow directory symlinks out of the app folder. */
export async function removeSharedWriteAccess(target: string): Promise<void> {
  const stats = await lstat(target);
  if (stats.isSymbolicLink()) return;
  if (stats.mode & 0o022) await chmod(target, stats.mode & 0o7755);
  if (!stats.isDirectory()) return;
  for (const entry of await readdir(target)) await removeSharedWriteAccess(path.join(target, entry));
}

async function run(command: string, args: string[], cwd: string): Promise<void> {
  const child = spawn(command, args, { cwd, stdio: "inherit" });
  const [code] = (await once(child, "exit")) as [number | null];
  if (code !== 0) throw new Error(`${command} ${args.join(" ")} exited with ${code}`);
}

function isLinuxArch(value: string): value is LinuxArch {
  return (LINUX_ARCHES as readonly string[]).includes(value);
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { arch: { type: "string" }, "output-dir": { type: "string" }, version: { type: "string" } } });
  const arch = values.arch ?? process.arch;
  if (!isLinuxArch(arch)) throw new Error(`--arch must be one of ${LINUX_ARCHES.join(", ")}, got ${arch}`);
  // pnpm runs package scripts in the package dir; resolve a relative --output-dir against where the user ran pnpm.
  const outputDir = path.resolve(process.env["INIT_CWD"] ?? process.cwd(), values["output-dir"] ?? path.join(repoRoot, "release"));

  // --version stamps a release version (CI passes x.y.z-nightly.YYYYMMDD.N); otherwise package.json's.
  const desktopPackage = JSON.parse(await readFile(path.join(desktopDir, "package.json"), "utf8")) as { version: string };
  const version = values.version ?? desktopPackage.version;
  if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) throw new Error(`--version must be semver, got ${version}`);

  await run(process.execPath, [path.join(desktopDir, "scripts/fetch-rh.ts"), "--target", rhTargetFor("linux", arch)!], desktopDir);
  await run("pnpm", ["--filter", "@rivethub/desktop...", "build"], repoRoot);

  for (const artifact of await packageLinux({ arch, outputDir, version, targets: LINUX_TARGETS })) console.log(artifact);
}

/** Packages the already-built dist-electron, staged rh and apps/web build. Returns the artifact paths. */
export async function packageLinux(options: {
  arch: LinuxArch;
  outputDir: string;
  version: string;
  targets: readonly (typeof LINUX_TARGETS)[number][];
}): Promise<string[]> {
  const electronVersion = (createRequire(import.meta.url)("electron/package.json") as { version: string }).version;
  const stage = await mkdtemp(path.join(tmpdir(), "rivethub-desktop-stage-"));
  try {
    await cp(path.join(desktopDir, "dist-electron"), path.join(stage, "dist-electron"), { recursive: true });
    const stagePackage = {
      name: EXECUTABLE_NAME,
      productName: PRODUCT_NAME,
      version: options.version,
      private: true,
      description: "RivetHub desktop app",
      homepage: "https://rivethub.io",
      author: { name: "RivetHub", email: "rivetphilbot@gmail.com" },
      desktopName: `${EXECUTABLE_NAME}.desktop`,
      main: "dist-electron/boot.cjs",
    };
    await writeFile(path.join(stage, "package.json"), `${JSON.stringify(stagePackage, null, 2)}\n`);
    return await build({
      projectDir: stage,
      targets: Platform.LINUX.createTarget([...options.targets], Arch[options.arch]),
      config: createBuildConfig({ electronVersion, outputDir: options.outputDir, version: options.version }),
      publish: "never",
    });
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(`build-desktop-artifact: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
