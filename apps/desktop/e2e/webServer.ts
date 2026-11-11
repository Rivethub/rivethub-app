import { createReadStream, statSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webmanifest": "application/manifest+json",
};

/**
 * Stands in for rh serving apps/web from `gateway.static_dir` until the
 * backend manager lands: the built web app with an SPA fallback, loopback only.
 */
export async function serveWebBuild(directory: string): Promise<{ origin: string; close: () => Promise<void> }> {
  const root = path.resolve(directory);
  const server: Server = createServer((request, response) => {
    // Off-origin exits a hostile or broken node could serve; the window must not follow them.
    if (request.url === "/redirect-out") {
      response.writeHead(302, { location: "https://example.com/" }).end();
      return;
    }
    if (request.url === "/meta-out") {
      response.writeHead(200, { "content-type": TYPES[".html"] }).end('<meta http-equiv="refresh" content="0;url=https://example.com/">');
      return;
    }
    const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://127.0.0.1").pathname);
    const candidate = path.resolve(root, `.${pathname}`);
    const inside = candidate.startsWith(root + path.sep);
    const file = inside && statSync(candidate, { throwIfNoEntry: false })?.isFile() ? candidate : path.join(root, "index.html");
    if (file !== candidate && path.extname(pathname) !== "") {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" });
    createReadStream(file).pipe(response);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    origin: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
