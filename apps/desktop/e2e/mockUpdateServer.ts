import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";

export interface MockUpdateServer {
  /** e.g. https://127.0.0.1:41234/desktop, the base the app appends `/<channel>/` to. */
  feedBase: string;
  /** Every path requested, in order. */
  requests: string[];
  /** Feed files wait for this, so a test can stub dialogs before the app sees an update. */
  release: () => void;
  close: () => Promise<void>;
}

/**
 * A static update host laid out like get.rivethub.io/desktop: `<root>/<channel>/latest-linux.yml`
 * and the packages beside it, served over https (a throwaway self-signed certificate) or http.
 */
export async function serveUpdateFeed(root: string, options: { protocol: "https" | "http" }): Promise<MockUpdateServer> {
  const requests: string[] = [];
  let release!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  const handler = (request: IncomingMessage, response: ServerResponse) => {
    const pathname = decodeURIComponent(new URL(request.url ?? "/", "https://127.0.0.1").pathname);
    requests.push(pathname);
    const file = path.resolve(root, `.${pathname.replace(/^\/desktop/, "")}`);
    if (!file.startsWith(root + path.sep) || !statSync(file, { throwIfNoEntry: false })?.isFile()) {
      response.writeHead(404).end();
      return;
    }
    void (file.endsWith(".yml") ? released : Promise.resolve()).then(() => {
      response.writeHead(200, { "content-type": "application/octet-stream" }).end(readFileSync(file));
    });
  };
  const server = options.protocol === "https" ? createHttpsServer(selfSignedCertificate(), handler) : createHttpServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    feedBase: `${options.protocol}://127.0.0.1:${port}/desktop`,
    requests,
    release,
    close: () => {
      release();
      server.closeAllConnections();
      return new Promise((resolve) => server.close(() => resolve()));
    },
  };
}

function selfSignedCertificate(): { key: Buffer; cert: Buffer } {
  const dir = mkdtempSync(path.join(tmpdir(), "rivethub-update-cert-"));
  try {
    const [key, cert] = [path.join(dir, "key.pem"), path.join(dir, "cert.pem")];
    execFileSync("openssl", [
      "req", "-x509", "-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:prime256v1", "-nodes", "-days", "1",
      "-subj", "/CN=127.0.0.1", "-addext", "subjectAltName=IP:127.0.0.1", "-keyout", key, "-out", cert,
    ], { stdio: "ignore" });
    return { key: readFileSync(key), cert: readFileSync(cert) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const sha512 = (data: Buffer | string) => createHash("sha512").update(data).digest("base64");

/**
 * Publishes `version` to `<root>/<channel>/` as electron-builder's generic provider lays it out:
 * the AppImage and .deb, and latest-linux.yml (latest-linux-arm64.yml on arm64) listing them.
 * `tamper` lists a sha512 that doesn't match the AppImage; `appImageUrl` overrides its URL.
 */
export function publishRelease(
  root: string,
  release: { channel: string; version: string; appImage: string; tamper?: boolean; appImageUrl?: string; manifestSig?: string },
): { appImageName: string; debName: string } {
  const dir = path.join(root, release.channel);
  mkdirSync(dir, { recursive: true });
  const appImageName = `RivetHub-${release.version}-${process.arch === "arm64" ? "arm64" : "x86_64"}.AppImage`;
  const debName = `RivetHub-${release.version}-${process.arch === "arm64" ? "arm64" : "amd64"}.deb`;
  const deb = `not a real .deb for ${release.version}`;
  writeFileSync(path.join(dir, appImageName), release.appImage);
  writeFileSync(path.join(dir, debName), deb);
  const appImageSha = release.tamper ? sha512(`${release.appImage} tampered`) : sha512(release.appImage);
  const manifest = {
    version: release.version,
    files: [
      { url: release.appImageUrl ?? appImageName, sha512: appImageSha, size: Buffer.byteLength(release.appImage) },
      { url: debName, sha512: sha512(deb), size: Buffer.byteLength(deb) },
    ],
    path: appImageName,
    sha512: appImageSha,
    releaseDate: "2026-11-11T00:00:00.000Z",
  };
  const manifestName = process.arch === "arm64" ? "latest-linux-arm64.yml" : "latest-linux.yml";
  // YAML is a superset of JSON.
  writeFileSync(path.join(dir, manifestName), JSON.stringify(manifest, null, 2));
  if (release.manifestSig !== undefined) {
    writeFileSync(path.join(dir, `${manifestName}.sig`), release.manifestSig);
  }
  return { appImageName, debName };
}
