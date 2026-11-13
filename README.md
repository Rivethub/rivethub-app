# rivethub-app

Everything in RivetHub that isn't the runtime. The runtime ([rivethub-runtime](https://github.com/Rivethub/rivethub-runtime), the `rh` binary) captures sessions from your coding harnesses, stores memory and serves it. This repo holds the apps that use that memory. The sign-in, telemetry and updates service is [rivethub-cloud](https://github.com/Rivethub/rivethub-cloud).

| Path | What it is |
| --- | --- |
| `apps/web` | The memory manager in the browser. `rh` serves the built files from `gateway.static_dir`. |
| `apps/mobile` | The same memory manager as an Expo app for Android and iOS. |
| `apps/desktop` | Electron shell around `apps/web`. The window loads the web app from the local `rh` node's own loopback origin. |
| `packages/contracts` | Types shared by everything here, matching the runtime's HTTP API. |
| `packages/client` | A typed client for a hub, used by web and mobile. |
| `integrations/opencode` | An opencode plug-in that tells `rh` when a session finishes a turn. |

## Develop

Needs Node 22.18 or later and pnpm (the version is pinned in `package.json`).

```sh
pnpm install
pnpm typecheck
pnpm test
pnpm --filter @rivethub/web dev
```

The web and mobile apps both run on sample data until you pair them with a hub. Each app's README covers its own build and deploy steps.

The desktop app:

```sh
pnpm dev:desktop             # Vite for apps/web plus Electron pointed at it; /api goes to rh
pnpm dev:desktop --sample    # the same, on sample data
pnpm build:desktop           # builds apps/web, then apps/desktop/dist-electron
pnpm test:desktop            # Playwright end-to-end; on a headless box: xvfb-run -a -s '-screen 0 1920x1080x24' pnpm test:desktop
pnpm dist:desktop:linux --arch x64   # AppImage + .deb in release/ (--arch arm64, --output-dir <dir>)
xvfb-run -a -s '-screen 0 1920x1080x24' pnpm smoke:desktop --executable release/RivetHub-0.0.0-x86_64.AppImage   # or the .deb
```

xvfb-run's default screen is 640x480, which is smaller than the window's minimum size; the e2e window-bounds and clipboard tests fail on it.

`dist:desktop:linux` stages the rh pinned in `apps/desktop/rh.lock.json` for the target arch, builds `apps/web` and `apps/desktop`, and packages them with electron-builder. The app's `resources/` holds `rh/` (`rh`, `rivethub-migrate`, rh's `LICENSE`) and `web/` (the `apps/web` build). `smoke:desktop` opens the packaged app on sample data served from that `web/` and checks `resources/rh/rh version`. The `Release desktop` workflow runs both on x64 and arm64 and uploads the AppImage and .deb as workflow artifacts.

The AppImage starts only where unprivileged user namespaces work, which Chromium's sandbox needs there. Elsewhere, such as Ubuntu 24.04 with its default AppArmor policy, its `AppRun` (`apps/desktop/linux/AppRun`) exits with a message pointing to the .deb instead of running the app with `--no-sandbox`. The .deb's postinst installs an AppArmor profile that lets the sandbox run.

`RIVETHUB_DESKTOP_URL` sets the page the window opens. It must be a loopback `http(s)` URL, and the default is `http://127.0.0.1:5174/`. The window can't navigate away from that origin.

### Desktop updates

The app updates itself with electron-updater from static files on `https://get.rivethub.io/desktop/<channel>/`: `latest-linux.yml` (`latest-linux-arm64.yml` on arm64) next to the packages. There is no cloud service in the path. Until the user picks a channel, the app follows the one its build was published to: `nightly` for a `-nightly.YYYYMMDD.N` version, otherwise `stable`. A user switches through `window.rivethub.updates.setChannel`, and the choice is saved in `update-settings.json` in the app's user data and wins from then on. The packaged app checks on startup and every six hours, and only over https. electron-updater rejects a download whose sha512 doesn't match the manifest.

- **AppImage.** The new AppImage downloads in the background. The app then asks before it restarts. Answering "Restart now" (or calling `rivethub.updates.restartToUpdate()`) replaces the AppImage file in place and starts the new one. Nothing installs on quit. If the install fails, the error stays for the rest of that session, because electron-updater won't try again until the app restarts.
- **.deb.** dpkg owns the files, so the app can't replace them. It says a new version is available and links to the new .deb in the channel's directory. electron-builder writes a `resources/package-type` file into the .deb, which is how the app tells the two apart.
- **Unpacked copies and dev runs.** They don't check. An unpackaged run honors `RIVETHUB_DESKTOP_UPDATE_FEED` and `RIVETHUB_DESKTOP_PACKAGE_TYPE` for the end-to-end tests. A packaged app ignores both.

The app's version is independent of rh's. Each app build ships the rh pinned in `apps/desktop/rh.lock.json`, so updating the app is how a desktop user gets a newer rh. On the next start after an update, the app reinstalls `~/.local/bin/rh` from its bundle (the backend manager, PR 5). The updater itself does nothing with rh.

`pnpm dist:desktop:linux` writes the manifests next to the packages. A version like `0.2.0-nightly.20261111.1` builds for `nightly`, and anything else builds for `stable`. Running the `Release desktop` workflow with `publish` set uploads both arches to the channel's directory. That job stays off until `DESKTOP_PUBLISH_ENABLED` is set; see its TODO.

### Sharing sessions

The desktop app can share sessions with someone else and receive theirs (Share and Receive in the sidebar). They are routes in `apps/web` that appear only when the Electron bridge (`window.rivethub`) is present, so the plain browser build and mobile don't show them. They call rh's local `/api/share/**` routes (rivethub-runtime CONTRACT notes 151 and 152) through `createShareClient` in `packages/client`; `packages/contracts` has the types.

- **Share.** Search sessions, then approve, redact (exact terms, optionally drop tool outputs) or deny each one in a single table. Nothing is sanitized until you confirm that table. Walk the sanitizer's flags (keep, redact or map), choose rivethub.cloud or a team server, confirm the counts rh checks, and get a one-time code to send privately.
- **Receive.** Paste the code into a masked field. rh downloads the bundle and checks it, and the screen shows who sent it, whether that verified, and what was held per session. Each held session is imported, skipped or held span by span. A sender's key can be trusted after a fingerprint check, and Settings has the node's own key and the trusted senders (Share keys).
- **The code is a live secret.** It is held in the screen's memory only. It never goes into a URL, history entry, storage, a query cache or a log, and leaving the screen drops it.
- **Sign-in.** The window is signed in by a browser session; `apps/web` sends its CSRF token (`rh-csrf` in `localStorage`) as `X-RH-CSRF` through the client's `auth` option. Sending, signing in to a share server and trusting a key need a fresh sign-in. When rh answers `reauth_required`, the screen offers "Sign in again". That calls the preload's `relogin()`, where main reads the owner token (the path comes from `rh auth token-path --json`; the renderer never holds the token), mints a one-time login code at `POST /api/auth/login-codes`, and returns only the code. The page trades it at `POST /api/auth/session` for a fresh session and CSRF token without navigating, so the Share draft, or the Receive code, report and decisions, stay on screen and the person retries.

`apps/desktop/e2e/share.live.spec.ts` drives the real screens in Electron against throwaway rh nodes; see the header of that file to run it.

## Deploy the web app to a hub

```sh
pnpm --filter @rivethub/web build
dest=~/.local/opt/rivethub/web/$(git rev-parse --short HEAD)
mkdir -p "$dest" && cp -r apps/web/dist/. "$dest"
ln -sfn "$dest" ~/.local/opt/rivethub/web/current
```

Point `gateway.static_dir` in the `rh` config at `~/.local/opt/rivethub/web/current`.
