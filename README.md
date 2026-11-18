# rivethub-app

Everything in RivetHub that isn't the runtime. The runtime ([rivethub-runtime](https://github.com/Rivethub/rivethub-runtime), the `rh` binary) captures sessions from your coding harnesses, stores memory and serves it. This repo holds the apps that use that memory. The sign-in, telemetry and updates service is [rivethub-cloud](https://github.com/Rivethub/rivethub-cloud).

| Path | What it is |
| --- | --- |
| `apps/web` | The memory manager in the browser. `rh` serves the published build, or the directory in `gateway.static_dir` when that is set. |
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

## How the app is laid out

One navigation on every screen, so nothing moves when you change section:

| Where | What it is for |
| --- | --- |
| **Today** | What your agents did, what needs a decision, one line if capture or a model is failing, and the single next step from the guide. |
| **Review** | Everything memory is unsure of, decided from the keyboard. |
| **Sessions** | Every captured session with its gist, tool, topic and state. Filter by text, tool, unfiled, kept or trash; J, K and Enter move and open. A session opens on its summary, then the messages. |
| **Topics**, **Entities** | The organized view. Each page shows the whole article the workers wrote, rendered from Markdown, with decisions (topics) or current facts and a timeline (entities) beside it. The entity list filters by text and type and sorts by name or sessions. Topics can be created by hand, so filing works before any model is set. |
| **Shared** | What is shared with each space on this hub, and sending to or receiving from another RivetHub. |
| **Search** (`/` or Ctrl K) | Ctrl K jumps to a topic, entity or session. The Search page lists every match inside sessions, with time chips and filters for messages or summaries and for how to match. |
| **Stats** | What is in memory and whether the workers are keeping up, with failed jobs to retry or dismiss. |
| **Guide** | Ten steps in five stages (capture, recall, understand, curate, share) and the shortcuts. A step is done when the hub's state says so, or when you did it once in this browser; nothing about it is stored on the hub. |

The default theme is RivetHub's own palette, taken from `rivethub-desktop`, in dark and light. Everforest and the two T3 themes are still in Settings.

Two things the app does because of how `rh` 0.8 behaves, both in `packages/client`:

- **A session's messages.** The detailed transcript comes from the tool's own files, which exist only on the machine that ran the session, and `rh` answers an empty transcript elsewhere. The client then reads what memory stored (`storedTranscript`) from `GET /api/sessions/{session}/messages`, following `next` until the session is complete. A hub that answers 404 or 405 for that route is read by browsing the session's time span: the client discovers the capturing agent from matching messages and filters later pages by that name, with a 100-page cap, and marks an incomplete read.
- **An entity's article.** `/api/entities/{id}` carries the page's summary and facts but not its article. Every entity is also a topic, so the client reads the article from `/api/topics/{id}/page` and joins the two. The entity worker ends its article with a "Current facts" list; the page drops that list when the facts themselves are shown.
- **Renaming.** `rh` renames only Claude Code and Grok Build sessions, in the tool's own store. The app offers title editing only when the hub explicitly advertises rename support for the tool. rh 0.8.3 does not advertise it, so its session titles are read-only.

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

The app's version is independent of rh's. Each app build ships the rh pinned in `apps/desktop/rh.lock.json` and uses that bundled binary to find the owner token for login (`RIVETHUB_RH` can override it). The current main process does not install, start or upgrade rh, compare an existing rh's version, or configure the node to serve the bundled web build. An existing older or newer `~/.local/bin/rh` is left untouched, without a version warning. The app needs an already-running node serving the UI at `RIVETHUB_DESKTOP_URL` (default port 5174). First-run backend management remains a known gap.

`pnpm dist:desktop:linux` writes the manifests next to the packages. A version like `0.2.0-nightly.20261111.1` builds for `nightly`, and anything else builds for `stable`. Running the `Release desktop` workflow with `publish` set uploads both arches to the channel's directory. That job stays off until `DESKTOP_PUBLISH_ENABLED` is set; see its TODO.

### Account sign-in

Account sign-in uses device approval in your browser. It requires runtime commit
`22d556c8a890e40b5c65b66d38de99070c25fae9` (`fix/account-device-login`, CONTRACT note 155).
The runtime version remains 0.8.3; an unpatched 0.8.3 or earlier node cannot use this flow.
The app explains that limitation and offers GitHub updates without an account.
Signing in here and `rh share login` use the same node login; signing out ends it for both.
Account deletion signs this node out and provides a link to finish deletion on the cloud account page.

For sample screens, use `?sample&accountLogin=pending` (`expired` or `denied` exercises those outcomes).

### Sharing sessions

The desktop app can share sessions with someone else and receive theirs. Both start from **Shared** in the sidebar, which also lists what is shared with each space on this hub, and a session's own **Share…** button opens the flow with that session already found and ticked. The send and receive routes in `apps/web` work only when the Electron bridge (`window.rivethub`) is present, so the plain browser build and mobile explain sharing but don't offer the two actions. They call rh's local `/api/share/**` routes (rivethub-runtime CONTRACT notes 151 and 152) through `createShareClient` in `packages/client`; `packages/contracts` has the types.

- **Share.** Search sessions, then approve, redact (exact terms, optionally drop tool outputs) or deny each one in a single table. Nothing is sanitized until you confirm that table. Walk the sanitizer's flags (keep, redact or map), choose rivethub.cloud or a team server, confirm the counts rh checks, and get a one-time code to send privately.
- **Receive.** Paste the code into a masked field. rh downloads the bundle and checks it, and the screen shows who sent it, whether that verified, and what was held per session. Each held session is imported, skipped or held span by span. A sender's key can be trusted after a fingerprint check, and Settings has the node's own key and the trusted senders (Share keys).
- **The code is a live secret.** It is held in the screen's memory only. It never goes into a URL, history entry, storage, a query cache or a log, and leaving the screen drops it.
- **Sign-in.** The window is signed in by a browser session; `apps/web` sends its CSRF token (`rh-csrf` in `localStorage`) as `X-RH-CSRF` through the client's `auth` option. Sending, signing in to a share server and trusting a key need a fresh sign-in. When rh answers `reauth_required`, the screen offers "Sign in again". That calls the preload's `relogin()`, where main reads the owner token (the path comes from `rh auth token-path --json`; the renderer never holds the token), mints a one-time login code at `POST /api/auth/login-codes`, and returns only the code. The page trades it at `POST /api/auth/session` for a fresh session and CSRF token without navigating, so the Share draft, or the Receive code, report and decisions, stay on screen and the person retries.

`apps/desktop/e2e/share.live.spec.ts` drives the real screens in Electron against throwaway rh nodes; see the header of that file to run it.

## Release the web app

A node installs the newest published web build it can run with `rh update`. The build is a GitHub release of this repo. The tag is `web-v` plus the version, and the release holds `rivethub-web-<version>.tar.gz` and `web-manifest.json`.

The version lives in `apps/web/package.json`. The first one is 0.8.2, the same version as `apps/desktop`, because that shell already ships this UI. `rivethub.minRhVersion` in the same file is the oldest `rh` the build runs on. It is 0.8.3, the runtime this app was checked against.

Cut a stable release by bumping `version`, merging to `main`, and pushing the tag `web-v` plus that version. The tag for 0.8.2 is `web-v0.8.2`. A beta keeps the package version and puts the beta number in the tag, such as `web-v0.8.2-beta.1`. The Release web workflow checks the tag against the package version, builds and tests `@rivethub/web`, and publishes the archive and the manifest. It stops if that tag already has a release. A published version is not replaced.

A push to `main` that changes `apps/web` or `packages` publishes a nightly prerelease, `web-v<version>-nightly.<UTC date>.<run>`. Dispatching the Release web workflow on `main` publishes one too. The workflow keeps the 10 newest nightlies and deletes the older ones. After stable `x.y.z` ships, bump `version`. A nightly of `x.y.z` sorts below stable `x.y.z`, so a node that takes the newest build stays on the stable release until the package version moves.

To serve a build you made yourself, run `pnpm --filter @rivethub/web build` and set `gateway.static_dir` to `apps/web/dist`. An explicit `static_dir` wins over the copy `rh update` installed.

Licensed under Apache-2.0.
