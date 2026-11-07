import type { ServerResponse } from "node:http";

export const securityHeaders = {
  "Content-Security-Policy":
    "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Cache-Control": "no-store",
} as const;

export function setSecurityHeaders(res: ServerResponse): void {
  for (const [name, value] of Object.entries(securityHeaders)) res.setHeader(name, value);
}
