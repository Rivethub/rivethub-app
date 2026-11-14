import type { SignInState } from "@rivethub/client-runtime/sign-in";
export function DeviceApproval({ state }: { state: SignInState }) {
  if (state.phase !== "waiting") return null;
  const url = new URL(state.details.verificationUri);
  const safe = url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
  return <div role="status" className="flex min-w-0 flex-col items-start gap-3 rounded-lg border border-border bg-background p-4">
    <span>Approve this code in your browser:</span>
    <span className="break-all text-[13px] text-muted-foreground">{url.origin}{url.pathname}</span>
    <strong className="font-mono text-2xl tracking-widest">{state.details.userCode}</strong>
    {safe && <a href={url.href} target="_blank" rel="noreferrer" className="rounded-lg bg-primary px-3 py-2 text-primary-foreground">Open RivetHub sign-in</a>}
    <span className="text-[13px] text-muted-foreground">Waiting for approval. The code expires in {Math.ceil(state.details.expiresIn / 60)} minutes.</span>
  </div>;
}
