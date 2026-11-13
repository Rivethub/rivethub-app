import type { TrustedSender } from "@rivethub/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useShareClient } from "../client/context";
import { Button, Loading } from "../components/ui";
import { describeFailure, type Failure } from "./failure";
import { Card, FailureNote, field } from "./ui";

const TRUSTED = ["share", "trusted"] as const;

/** This machine's share key, and the senders whose key you trust. Trusting a key is what makes a sender's bundles arrive verified. */
export function ShareKeys() {
  const share = useShareClient();
  const client = useQueryClient();
  const key = useQuery({ queryKey: ["share", "key"], queryFn: () => share!.key(), enabled: share !== null, retry: false });
  const trusted = useQuery({ queryKey: TRUSTED, queryFn: () => share!.trusted(), enabled: share !== null, retry: false });
  const [failure, setFailure] = useState<Failure | null>(null);
  if (!share) return <p className="m-0 text-muted-foreground">Share keys are in the RivetHub desktop app.</p>;
  const refresh = () => client.invalidateQueries({ queryKey: TRUSTED });
  const fail = (error: unknown) => setFailure(describeFailure(error, "receive"));
  return (
    <>
      {failure && <FailureNote failure={failure} onDismiss={() => setFailure(null)} />}
      <Card title="Your key">
        {key.isPending && <Loading label="Loading" />}
        {key.isError && <FailureNote failure={describeFailure(key.error, "send")} />}
        {key.data && (
          <>
            <p className="m-0 text-[13px] text-muted-foreground">Bundles you share are signed with this key. Give people the fingerprint over a channel you trust so they can check it.</p>
            <p className="m-0 font-mono text-[14px]" aria-label="Your fingerprint">{key.data.fingerprint}</p>
            <p className="m-0 font-mono text-[12px] break-all text-muted-foreground">{key.data.key}</p>
          </>
        )}
      </Card>
      <Card title="Senders you trust">
        {trusted.isPending && <Loading label="Loading" />}
        {trusted.isError && <FailureNote failure={describeFailure(trusted.error, "receive")} />}
        {trusted.data?.length === 0 && <p className="m-0 text-muted-foreground">No one yet. Bundles signed by a key you haven't trusted arrive as unverified.</p>}
        {trusted.data && trusted.data.length > 0 && (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {trusted.data.map((s) => (
              <Sender key={`${s.name}:${s.key}`} sender={s} onRemove={() => void share.untrust(s.name, s.key).then(refresh, fail)} />
            ))}
          </ul>
        )}
        <AddSender onAdded={refresh} onFail={fail} />
      </Card>
    </>
  );
}

function Sender({ sender, onRemove }: { sender: TrustedSender; onRemove: () => void }) {
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-2.5">
      <span className="font-medium">{sender.name}</span>
      <span className="flex-1 font-mono text-[12px] text-muted-foreground">{sender.fingerprint}</span>
      <Button size="xs" variant="ghost" aria-label={`Stop trusting ${sender.name}`} onClick={onRemove}>Remove</Button>
    </li>
  );
}

function AddSender({ onAdded, onFail }: { onAdded: () => void; onFail: (error: unknown) => void }) {
  const share = useShareClient()!;
  const [name, setName] = useState("");
  const [keyText, setKeyText] = useState("");
  const [checked, setChecked] = useState(false);
  const ready = name.trim() !== "" && keyText.trim() !== "" && checked;
  return (
    <form
      className="flex flex-col gap-2 border-t border-border pt-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!ready) return;
        void share.trust(name.trim(), keyText.trim()).then(() => {
          setName("");
          setKeyText("");
          setChecked(false);
          onAdded();
        }, onFail);
      }}
    >
      <span className="text-[13px] font-medium">Trust a sender</span>
      <label className="flex flex-col gap-1 text-[12px]">
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" className={field} />
      </label>
      <label className="flex flex-col gap-1 text-[12px]">
        Their public key
        <input value={keyText} onChange={(e) => setKeyText(e.target.value)} autoComplete="off" spellCheck={false} placeholder="ed25519:…" className={`${field} font-mono`} />
      </label>
      <label className="flex items-center gap-2 text-[13px]">
        <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} className="accent-primary" />
        I checked this key's fingerprint with them
      </label>
      <div><Button type="submit" size="md" variant="primary" disabled={!ready}>Trust this sender</Button></div>
    </form>
  );
}
