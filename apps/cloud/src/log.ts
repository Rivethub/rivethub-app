export function logRequest(info: { method: string; path: string; status: number; ms: number }): void {
  process.stdout.write(JSON.stringify({ ts: new Date().toISOString(), ...info }) + "\n");
}

export function logError(err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  const redacted = message.replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "postgres://[redacted]");
  process.stderr.write(JSON.stringify({ ts: new Date().toISOString(), error: redacted }) + "\n");
}
