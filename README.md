# rivethub-app

Everything in RivetHub that isn't the runtime. The runtime ([rivethub-runtime](https://github.com/philbert440/rivethub-runtime), the `rh` binary) captures sessions from your coding harnesses, stores memory and serves it. This repo holds the apps that use that memory, and the small cloud service they share.

| Path | What it is |
| --- | --- |
| `apps/web` | The memory manager in the browser. `rh` serves the built files from `gateway.static_dir`. |
| `apps/mobile` | The same memory manager as an Expo app for Android and iOS. |
| `apps/cloud` | `rivethub.cloud`: email sign-in, anonymous telemetry and update manifests. |
| `packages/contracts` | Types shared by everything here, matching the runtime's HTTP API. |
| `packages/client` | A typed client for a hub, used by web and mobile. |
| `integrations/opencode` | An opencode plug-in that tells `rh` when a session finishes a turn. |

## Develop

Needs Node 22 or later and pnpm (the version is pinned in `package.json`).

```sh
pnpm install
pnpm typecheck
pnpm test
pnpm --filter @rivethub/web dev
```

The web and mobile apps both run on sample data until you pair them with a hub. Each app's README covers its own build and deploy steps.

## Deploy the web app to a hub

```sh
pnpm --filter @rivethub/web build
dest=~/.local/opt/rivethub/web/$(git rev-parse --short HEAD)
mkdir -p "$dest" && cp -r apps/web/dist/. "$dest"
ln -sfn "$dest" ~/.local/opt/rivethub/web/current
```

Point `gateway.static_dir` in the `rh` config at `~/.local/opt/rivethub/web/current`.
