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
pnpm test:desktop            # Playwright end-to-end; on a headless box: xvfb-run -a pnpm test:desktop
pnpm dist:desktop:linux --arch x64   # AppImage + .deb in release/ (--arch arm64, --output-dir <dir>)
xvfb-run -a pnpm smoke:desktop --executable release/RivetHub-0.0.0-x86_64.AppImage
```

`dist:desktop:linux` stages the rh pinned in `apps/desktop/rh.lock.json` for the target arch, builds `apps/web` and `apps/desktop`, and packages them with electron-builder. The app's `resources/` holds `rh/` (`rh`, `rivethub-migrate`, rh's `LICENSE`) and `web/` (the `apps/web` build). `smoke:desktop` opens the packaged app on sample data served from that `web/` and checks `resources/rh/rh version`. The `Release desktop` workflow runs both on x64 and arm64 and uploads the AppImage and .deb as workflow artifacts.

`RIVETHUB_DESKTOP_URL` sets the page the window opens. It must be a loopback `http(s)` URL, and the default is `http://127.0.0.1:5174/`. The window can't navigate away from that origin.

## Deploy the web app to a hub

```sh
pnpm --filter @rivethub/web build
dest=~/.local/opt/rivethub/web/$(git rev-parse --short HEAD)
mkdir -p "$dest" && cp -r apps/web/dist/. "$dest"
ln -sfn "$dest" ~/.local/opt/rivethub/web/current
```

Point `gateway.static_dir` in the `rh` config at `~/.local/opt/rivethub/web/current`.
