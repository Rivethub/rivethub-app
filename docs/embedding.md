# Embedding the RivetHub web app

This is the contract for a host that shows RivetHub's web app in its own window. The reference host is T3.1 Code, which loads the app in an Electron `<webview>` with its own partition. The types live in `packages/contracts/src/desktop.ts`.

Hosts that install the bundle directly can use the [web distribution contract](web-distribution.md).

## Host bridge

The preload sets `window.rivethub`. The web app reads that object once, in `readDesktopBridge` (`apps/web/src/lib/desktop.ts`). A missing object is a normal browser. An object without a function named `relogin` is also treated as no bridge.

```ts
window.rivethub = {
  relogin: async () => null,
  host: {
    name: "T4",
    appearance: {
      get: () => "dark",
      onChange: (listener) => () => listener,
    },
    openSession: async (request) => ({ opened: false, reason: "not available" }),
  },
};
```

`host` is optional on the type and required for embed mode. `name` is the label in the Open In menu. `appearance` and `openSession` are optional. The Open In menu uses `openSession` when it is present. The RivetHub desktop preload sets `relogin` and `updates`, and does not set `host`, so that app is not embedded.

`appearance.get` must return `"light"` or `"dark"`. `onChange` must return an unsubscribe function. A host object with a bad `name`, `appearance`, or `openSession` is ignored. The rest of the app still runs.

## Embed mode

One function decides. `decideEmbed` in `apps/web/src/lib/embed.ts` returns true when the parsed bridge has `host`, or when the search value `embed` is `1` or `"1"`. `EmbedState` reads the bridge and the router search, and `useEmbedded` is the only thing components call. Nothing else reads `window` for this.

Either trigger is enough.

`?embed=1` is part of the root search. Navigation keeps it. TanStack Router serializes the value as the number `1`, so the query stays `?embed=1` and does not become `?embed=%221%22`.

On a desktop width, embed mode hides the two pieces of chrome that repeat the host window.

- The sidebar brand row. That row is the logo and the rivethub wordmark.
- The inset window. That is the margin and the rounded border around the page.

The sidebar stays. It is the navigation the host does not provide: search, Today, Review, Library, Shared, pins, Stats, Guide, the hub switcher, and Settings. On a phone the page title, the hub chip, and the bottom tabs stay, because that layout has no second window.

The frame root carries `data-embedded="true"` or `data-embedded="false"`.

A live hub's first visit in a browser still opens the welcome screen, except when the path is a memory item. Welcome does not replace `/sessions/<id>` or `/topics/<id>`.

## Build version

The served build carries its version where a host can read it with no session.

`index.html` has two meta tags, written at build time.

```html
<meta name="rivethub-web-version" content="0.8.2" />
<meta name="rivethub-web-commit" content="<40-character sha>" />
```

`version.json` sits next to `index.html`.

```json
{"version":"0.8.2","commit":"<40-character sha>"}
```

`vite build` writes both. The version is `RIVETHUB_WEB_VERSION`, or `apps/web/package.json` when that variable is unset. The commit is `RIVETHUB_WEB_COMMIT`, then `GITHUB_SHA`, then `git rev-parse HEAD`, then the literal `unknown`.

The release workflow publishes a different version string, and `apps/web/scripts/package-web.ts` restamps `index.html` and `version.json` inside the tarball so the published bytes match the release.

- A tag `web-v*` publishes the tag with the `web-v` prefix removed. `web-v0.8.2` publishes `0.8.2`. `web-v1.2.3-beta.1` publishes `1.2.3-beta.1`.
- A push to `main` publishes `<package version>-nightly.<UTC YYYYMMDD>.<GITHUB_RUN_NUMBER>`.
- The commit in that tarball is `GITHUB_SHA`.

There is no `/api/version` route. The gateway serves `version.json` as a static file. On 2026-11-19, `GET /version.json` against the throwaway hub returned 200 before login, with the version and the commit, and with the same framing headers as the shell.

## Deep links

A host may open these paths. They are the stable contract. A contract path is never removed or repurposed. A rename keeps the old path as a redirect to the new one.

`apps/web/src/test/route-contract.test.tsx` loads the real route tree. The failure names this document when a path below disappears or stops opening its page, or when a listed search parameter is no longer kept.

| Path | Search parameters |
| --- | --- |
| `/` | `embed` |
| `/search` | `q`, `when`, `where`, `match`, `embed` |
| `/sessions` | `embed` |
| `/sessions/<id>` | `embed` |
| `/topics` | `embed` |
| `/topics/<id>` | `embed` |
| `/entities` | `embed` |
| `/entities/<id>` | `embed` |

`embed` is accepted on every path in the table when its value is `1`. Navigation keeps it.

On `/search` the other parameters are:

- `q`, the query text. A non-empty value is kept.
- `when` is `today`, `yesterday`, `last_7d`, or `last_14d`.
- `where` is `messages` or `summaries`.
- `match` is `words`, `fuzzy`, `meaning`, or `pattern`.

A value outside those lists is dropped. Any other query key is not part of the contract and may change.

These paths are internal. A host should not link to them, because they may change from release to release: `/review`, `/settings`, `/settings/<section>`, `/library`, `/share`, `/receive`, `/shared`, `/stats`, `/guide`, and `/welcome`.

The gateway serves the contract paths as the public shell, with no session. The client does not send the browser to `/login` on its own.

When the hub answers a request with 401, the app stores the current path in `sessionStorage` under `rivethub.returnTo`. A signed-in visitor never stores one. The login page replaces the document with `/`. The root route then redirects to the stored path, including `?embed=1` when that query was present. The stored value is accepted only as a same-origin path. A protocol-relative URL, a `..` segment, or a URL with a scheme is dropped.

That recovery needs the web app to have loaded in the tab, and made its first request, before the host opens the login page. A fresh webview that opens `/login` first still lands on `/`. The gateway login script does that, and this repo does not ship that script. See the runtime ask below.

A memory item path is also exempt from the first-run redirect to `/welcome`.

## Framing and the session cookie

Measured on 2026-11-19 against `rh` 0.8.12, serving this build over `http://127.0.0.1:5298`. The hub ran in an isolated home directory. The real hub was not used.

The shell response for `/sessions/embed-probe?embed=1` carried both of these headers.

```text
content-security-policy: default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'
x-frame-options: DENY
```

An Electron `<webview>` with partition `persist:rh-embed-proof` still loaded that URL. The document rendered with `data-embedded="true"`, the version meta `0.8.2`, and the commit the build had stamped. `GET /version.json` from inside the webview, before login, returned 200 with the same version and commit.

A plain `<iframe>` of the hub origin in the same Electron window did not load. Chromium logged `ERR_BLOCKED_BY_RESPONSE`, and the frame console said the request was blocked because of `frame-ancestors 'none'`. A web or mobile host that uses an iframe gets the same refusal. The webview is not an iframe. It is a top-level guest, so those headers do not apply to it.

After the login page ran in that same webview, the guest URL was `/sessions/embed-probe?embed=1` again. The partition held cookie `rh_session` with `SameSite=strict`. This hub was HTTP, so the cookie was the plain name. The runtime uses `__Host-rh_session` when the hub is HTTPS. A later `GET /api/today` from the page, with the cookie and the `x-rh-csrf` value the login page stored, returned 200. The same request with `credentials: "omit"` returned 401. After a reload of the memory URL, `GET /api/today` returned 200 again.

The harness is `apps/desktop/e2e/embed-frame.mjs`. It does not print the login URL or the cookie value. Run it under Xvfb, with a hub that serves `apps/web/dist`.

```sh
export HOME=/tmp/rh-e2e-embed
export DIST=/absolute/path/to/apps/web/dist
env -i HOME="$HOME" PATH="$PATH" RIVETHUB_STATIC_DIR="$DIST" \
  rh local --port 5298 --no-lan --no-cloud --ensure --wait 20 --json
env -i HOME="$HOME" PATH="$PATH" RIVETHUB_STATIC_DIR="$DIST" \
  rh open --no-browser > /tmp/rh-login-url
xvfb-run -a -s '-screen 0 1920x1080x24' \
  env -u ELECTRON_RUN_AS_NODE \
  EMBED_HUB_ORIGIN=http://127.0.0.1:5298 \
  EMBED_LOGIN_URL="$(cat /tmp/rh-login-url)" \
  EMBED_CERT=/absolute/path/to/the/served/certificate.pem \
  EMBED_REPORT=/tmp/rh-embed-report.json \
  electron apps/desktop/e2e/embed-frame.mjs
env -i HOME="$HOME" PATH="$PATH" rh stop
```

Omit `EMBED_CERT` when the origin is HTTP. On `rh` 0.8.16 and later, `rh tls fingerprint --json` prints the certificate path as `cert`. The report JSON has the header values, the cookie name and `SameSite`, the API status with and without the cookie, and the iframe console line. It has no code and no cookie value.

`SameSite=strict` was enough for this partition because the webview's document is on the hub origin. The iframe never got a document, so it never held the session.

## What the runtime provides from 0.8.16

`rh` 0.8.16 answers a host in JSON, so a host no longer reads prose or scrapes the login URL. The runtime README section "Run rh inside another application" is the reference for the fields and exit codes.

| Need | Command |
| --- | --- |
| Is the node running, where, and can it serve this build | `rh status --json` |
| A one-time login URL and code | `rh open --json`. It exits 12 when the node runs and has no web app. |
| The certificate to pin | `rh tls fingerprint --json`. It fails on a node that serves plain HTTP. |
| Install a build the host already downloaded and verified | `rh update --web-only --from <archive> --sha256 <hex>` |

To sign in and land on a memory item, build the login URL as `<origin>/login?next=<path>#code=<code>`, with the path percent-encoded. The login page follows `next` only when it is a path on the same origin. On `rh` before 0.8.16 the login page always lands on `/`, and the web app restores the path only when the same tab loaded it first.

## What the runtime does not allow

The gateway sends `frame-ancestors 'none'` and `X-Frame-Options: DENY` on every response, including the shell and `version.json`. That is deliberate: it stops another site from framing a signed-in hub. An Electron `<webview>` is a top-level guest and is not affected. A host that frames the app in an `<iframe>` will not load it and will not receive the session cookie.
