// Proves what an Electron <webview> partition does with the hub's framing headers and session cookie.
//
//   EMBED_HUB_ORIGIN  https://127.0.0.1:5298
//   EMBED_LOGIN_URL   the rh open --no-browser URL (kept out of the report)
//   EMBED_CERT        PEM of the hub certificate, when the origin is https
//   EMBED_REPORT      where to write the JSON result
//
// Run under xvfb, with ELECTRON_RUN_AS_NODE unset:
//   xvfb-run -a -s '-screen 0 1920x1080x24' electron apps/desktop/e2e/embed-frame.mjs
import { app, BrowserWindow, session } from "electron";
import { X509Certificate } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const origin = process.env.EMBED_HUB_ORIGIN ?? "";
const loginUrl = process.env.EMBED_LOGIN_URL ?? "";
const certPath = process.env.EMBED_CERT ?? "";
const reportPath = process.env.EMBED_REPORT ?? "";
const PARTITION = "persist:rh-embed-proof";
const userData = mkdtempSync(path.join(tmpdir(), "rh-embed-session-"));
app.setPath("userData", userData);

function redact(value) {
  return String(value).replace(/code=[^&#\s"]+/g, "code=redacted");
}

function pathOf(value) {
  try {
    const url = new URL(value);
    return { path: url.pathname, search: url.search };
  } catch {
    return { path: "", search: "" };
  }
}

const report = {
  webviewLoaded: false,
  webviewEmbedded: false,
  versionMeta: null,
  commitMeta: null,
  framing: { xFrameOptions: null, frameAncestorsNone: false },
  afterLogin: { path: "", search: "" },
  cookie: { present: false, name: null, sameSite: null, sentOnApi: false },
  apiStatus: null,
  apiStatusWithoutSession: null,
  apiStatusAfterReload: null,
  csrfStored: false,
  versionJson: { status: null, version: null, commit: null },
  iframe: { refused: false, console: "" },
  error: "",
};

function finish(code) {
  if (reportPath) writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  app.exit(code);
}

function pinCertificate(partition) {
  if (!certPath) return;
  const expected = new X509Certificate(readFileSync(certPath, "utf8")).fingerprint256;
  const hostname = new URL(origin).hostname;
  partition.setCertificateVerifyProc((request, reply) => {
    try {
      const presented = new X509Certificate(request.certificate.data).fingerprint256;
      if (request.hostname === hostname && presented === expected) {
        reply(0);
        return;
      }
    } catch {
      // The presented bytes were not a certificate. Fail the pin.
    }
    reply(-3);
  });
}

function header(headers, name) {
  if (!headers) return null;
  const found = Object.entries(headers).find(([key]) => key.toLowerCase() === name);
  const value = found?.[1];
  if (Array.isArray(value)) return value.join(", ");
  return value ?? null;
}

function noteConsole(...args) {
  const message = redact(typeof args[1] === "string" ? args[1] : args[0]?.message ?? "");
  if (/refused to display|frame-ancestors|x-frame-options/i.test(message)) iframeNotes.push(message);
}

const iframeNotes = [];
app.on("web-contents-created", (_event, contents) => {
  contents.on("console-message", noteConsole);
});

app.whenReady().then(async () => {
  if (!origin || !loginUrl || !reportPath) {
    report.error = "EMBED_HUB_ORIGIN, EMBED_LOGIN_URL, and EMBED_REPORT are required";
    finish(1);
    return;
  }
  const partition = session.fromPartition(PARTITION);
  pinCertificate(partition);
  const seen = [];
  partition.webRequest.onHeadersReceived((details, callback) => {
    if (details.resourceType === "mainFrame" && details.url.startsWith(origin)) {
      const csp = header(details.responseHeaders, "content-security-policy") ?? "";
      seen.push({
        xFrameOptions: header(details.responseHeaders, "x-frame-options"),
        frameAncestorsNone: csp.includes("frame-ancestors"),
        csp,
      });
    }
    callback({ responseHeaders: details.responseHeaders });
  });
  partition.webRequest.onBeforeSendHeaders((details, callback) => {
    if (new URL(details.url).pathname.startsWith("/api/")) {
      const cookie = header(details.requestHeaders, "cookie");
      if (cookie && (cookie.includes("rh_session=") || cookie.includes("__Host-rh_session="))) report.cookie.sentOnApi = true;
    }
    callback({ requestHeaders: details.requestHeaders });
  });

  const dir = mkdtempSync(path.join(app.getPath("temp"), "rh-embed-"));
  const hostPage = path.join(dir, "host.html");
  const probe = `${origin}/sessions/embed-probe?embed=1`;
  writeFileSync(
    hostPage,
    `<!doctype html><meta charset="utf-8"><title>embed host</title>
<webview id="guest" partition="${PARTITION}" src="${probe}" style="width:1100px;height:800px"></webview>
<iframe id="framed" src="${origin}/" style="width:320px;height:180px"></iframe>`,
  );

  const win = new BrowserWindow({
    width: 1200,
    height: 900,
    show: false,
    webPreferences: { webviewTag: true, contextIsolation: true, nodeIntegration: false, sandbox: true },
  });

  const guest = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("webview did not attach")), 15000);
    win.webContents.once("did-attach-webview", (_event, contents) => {
      clearTimeout(timer);
      resolve(contents);
    });
    win.loadFile(hostPage).catch(reject);
  });

  const waitForUrl = (pred) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`url stayed ${redact(guest.getURL())}`)), 20000);
      const check = () => {
        if (!pred(guest.getURL())) return;
        clearTimeout(timer);
        guest.removeListener("did-navigate", check);
        guest.removeListener("did-finish-load", check);
        guest.removeListener("did-navigate-in-page", check);
        resolve(guest.getURL());
      };
      guest.on("did-navigate", check);
      guest.on("did-finish-load", check);
      guest.on("did-navigate-in-page", check);
      check();
    });

  try {
    await waitForUrl((url) => url.startsWith(probe));
    const page = await guest.executeJavaScript(`new Promise((resolve, reject) => {
      const read = () => {
        const embedded = document.querySelector("[data-embedded]");
        if (!embedded) return null;
        return {
          embedded: embedded.getAttribute("data-embedded"),
          version: document.querySelector("meta[name='rivethub-web-version']")?.content ?? null,
          commit: document.querySelector("meta[name='rivethub-web-commit']")?.content ?? null,
          brand: Boolean(document.querySelector("nav[aria-label='Sidebar'] img[aria-label='RivetHub']")),
        };
      };
      const found = read();
      if (found) return resolve(found);
      const timer = setTimeout(() => reject(new Error("app did not render")), 15000);
      const obs = new MutationObserver(() => {
        const next = read();
        if (!next) return;
        clearTimeout(timer);
        obs.disconnect();
        resolve(next);
      });
      obs.observe(document.documentElement, { childList: true, subtree: true });
    })`);
    report.webviewLoaded = true;
    report.webviewEmbedded = page.embedded === "true" && page.brand === false;
    report.versionMeta = page.version;
    report.commitMeta = page.commit;
    report.versionJson = await guest.executeJavaScript(`fetch("/version.json", { credentials: "omit", headers: { accept: "application/json" } }).then(async (response) => {
      const body = response.ok ? await response.json() : {};
      return { status: response.status, version: body.version ?? null, commit: body.commit ?? null };
    })`);
    const shell = seen.find((row) => row.csp);
    if (shell) {
      report.framing.xFrameOptions = shell.xFrameOptions;
      report.framing.frameAncestorsNone = shell.csp.includes("frame-ancestors");
    }

    let leftProbe = false;
    const landed = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`login returned to ${redact(guest.getURL())}`)), 20000);
      const check = () => {
        const url = guest.getURL();
        const { path } = pathOf(url);
        if (path === "/login" || path === "/") leftProbe = true;
        if (leftProbe && path === "/sessions/embed-probe") {
          clearTimeout(timer);
          resolve(url);
        }
      };
      guest.on("did-navigate", check);
      guest.on("did-navigate-in-page", check);
      guest.on("did-finish-load", check);
      guest.loadURL(loginUrl).catch(() => {});
    });
    report.afterLogin = pathOf(landed);

    const cookies = await partition.cookies.get({ url: origin });
    const sessionCookie = cookies.find((cookie) => cookie.name === "rh_session" || cookie.name === "__Host-rh_session");
    report.cookie.present = sessionCookie !== undefined;
    report.cookie.name = sessionCookie?.name ?? null;
    report.cookie.sameSite = sessionCookie?.sameSite ?? null;

    const apiProbe = `(() => {
      const csrf = localStorage.getItem("rh-csrf");
      const headers = { accept: "application/json" };
      if (csrf) headers["x-rh-csrf"] = csrf;
      const status = (credentials) => fetch("/api/today", { credentials, headers }).then((response) => response.status);
      return Promise.all([status("include"), status("omit")]).then(([withSession, withoutSession]) => ({
        withSession,
        withoutSession,
        csrfStored: Boolean(csrf),
      }));
    })()`;
    const first = await guest.executeJavaScript(apiProbe);
    report.apiStatus = first.withSession;
    report.apiStatusWithoutSession = first.withoutSession;
    report.csrfStored = first.csrfStored;
    await guest.reload();
    await waitForUrl((url) => pathOf(url).path === "/sessions/embed-probe");
    const second = await guest.executeJavaScript(apiProbe);
    report.apiStatusAfterReload = second.withSession;

    await new Promise((resolve) => setTimeout(resolve, 1000));
    report.iframe.console = iframeNotes[0] ?? "";
    report.iframe.refused = iframeNotes.length > 0;
    finish(0);
  } catch (error) {
    report.error = redact(error instanceof Error ? error.message : String(error));
    report.iframe.console = iframeNotes[0] ?? "";
    report.iframe.refused = iframeNotes.length > 0;
    finish(1);
  }
}).catch((error) => {
  report.error = redact(error instanceof Error ? error.message : String(error));
  finish(1);
});
