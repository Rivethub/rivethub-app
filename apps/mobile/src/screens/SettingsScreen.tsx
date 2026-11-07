import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { Account, HarnessStatus, ModelJob, ModelRole } from "@rivethub/contracts";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useAccount, useDeleteAccount, useHarnesses, useModelJobs, usePollSignIn, useSignIn, useSignOut, useUpdateAccount } from "../data/queries";
import type { RootParams } from "../nav/types";
import { THEMES, type ThemeId } from "../theme/tokens";
import { useTheme } from "../theme/Theme";
import { BackButton, DataBanner, GhostButton, Loading, PrimaryButton, Screen, TextField } from "../ui/chrome";
import { alpha } from "../theme/tokens";
import { errorText } from "../ui/format";

type Props = NativeStackScreenProps<RootParams, "Settings">;

const ROLE_NAME: Record<ModelRole, string> = {
  default: "Default",
  summarizer: "Summarizer",
  categorizer: "Categorizer",
  "wiki-writer": "Wiki writer",
  embedder: "Embedder",
};

const TITLES = {
  connections: "Connections",
  account: "Account and updates",
  appearance: "Appearance",
  sharing: "Sharing",
  trust: "Trust rules",
} as const;

export function SettingsScreen({ route, navigation }: Props) {
  const { palette } = useTheme();
  const section = route.params.section;
  return (
    <Screen>
      <View style={{ flexDirection: "row", alignItems: "center", paddingRight: 16 }}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={{ color: palette.foreground, fontSize: 17, fontWeight: "600" }}>{TITLES[section]}</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}>
        {section === "connections" ? <Connections /> : null}
        {section === "account" ? <AccountSection /> : null}
        {section === "appearance" ? <Appearance /> : null}
        {section === "sharing" ? <NotYet title="Sharing is not on the phone yet." body="People and spaces stay on the hub. Nothing here is editable." /> : null}
        {section === "trust" ? <NotYet title="Trust rules are not on the phone yet." body="What skips Review stays on the hub. Nothing here is editable." /> : null}
      </ScrollView>
    </Screen>
  );
}

function NotYet({ title, body }: { title: string; body: string }) {
  const { palette } = useTheme();
  return (
    <View style={{ borderRadius: 14, borderWidth: 1, borderStyle: "dashed", borderColor: palette.input, padding: 16, gap: 6 }}>
      <Text style={{ color: palette.foreground, fontSize: 16 }}>{title}</Text>
      <Text style={{ color: palette.muted, fontSize: 13, lineHeight: 18 }}>{body}</Text>
    </View>
  );
}

function Connections() {
  const { palette } = useTheme();
  const harnesses = useHarnesses();
  const jobs = useModelJobs();
  const loading = !harnesses.data || !jobs.data;
  if (harnesses.isError || jobs.isError) return <Text style={{ color: palette.error }}>{errorText(harnesses.error ?? jobs.error)}</Text>;
  if (loading) return <Loading label="Loading connections…" />;
  const stale = harnesses.data.filter((harness) => harness.capture.state === "stale");
  const unhealthy = jobs.data.filter((job) => job.health !== "healthy");
  const issues = [
    ...stale.map((harness) => `${harness.name} stopped sending sessions`),
    ...unhealthy.map((job) => `the ${ROLE_NAME[job.role].toLowerCase()} is ${job.health}`),
  ];
  return (
    <View style={{ gap: 16 }}>
      <DataBanner />
      {issues.length > 0 ? (
        <View style={{ borderRadius: 12, borderWidth: 1, borderColor: alpha(palette.warning, 0.4), backgroundColor: alpha(palette.warning, 0.12), padding: 12, gap: 6 }}>
          <Text style={{ color: palette.foreground, fontWeight: "600" }}>{issues.length} thing{issues.length === 1 ? "" : "s"} to fix.</Text>
          <Text style={{ color: palette.foreground, lineHeight: 20 }}>{issues.join(". ")}.</Text>
        </View>
      ) : null}
      <Text style={{ color: palette.muted, fontSize: 13 }}>Connections are read-only on the phone.</Text>
      <Text style={{ color: palette.muted, fontSize: 12, fontWeight: "600" }}>HARNESSES · CAPTURE · RECALL</Text>
      <View style={{ borderRadius: 14, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.card, overflow: "hidden" }}>
        {harnesses.data.map((harness) => (
          <HarnessRow key={harness.id} harness={harness} />
        ))}
      </View>
      <Text style={{ color: palette.muted, fontSize: 12, fontWeight: "600" }}>WHO DOES THE WORK</Text>
      <View style={{ borderRadius: 14, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.card, overflow: "hidden" }}>
        {jobs.data.map((job) => (
          <JobRow key={job.role} job={job} />
        ))}
      </View>
    </View>
  );
}

function HarnessRow({ harness }: { harness: HarnessStatus }) {
  const { palette } = useTheme();
  const capture = harness.capture.state === "receiving" ? palette.success : harness.capture.state === "stale" ? palette.warning : palette.input;
  const recall = harness.recall.state === "connected" ? palette.success : palette.input;
  const captureText = harness.capture.state === "receiving" ? "Capturing" : harness.capture.state === "stale" ? "Stopped" : "Not connected";
  const recallText = harness.recall.state === "connected" ? "recall on" : "recall off";
  return (
    <View style={{ minHeight: 56, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: palette.border }}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: palette.foreground, fontWeight: "500" }}>{harness.name}</Text>
        <Text style={{ color: palette.muted, fontSize: 12 }}>{captureText} · {recallText}</Text>
      </View>
      <View accessibilityLabel={`Capture: ${captureText}`} style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: capture }} />
      <View accessibilityLabel={`Recall: ${recallText}`} style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: recall }} />
    </View>
  );
}

function JobRow({ job }: { job: ModelJob }) {
  const { palette } = useTheme();
  const color = job.health === "healthy" ? palette.success : job.health === "slow" ? palette.warning : palette.error;
  const label = job.health === "healthy" ? "OK" : job.health === "slow" ? "Slow" : "Failing";
  const model = job.inheritsDefault ? "Default" : (job.model ?? job.provider ?? "Unset");
  return (
    <View style={{ minHeight: 52, flexDirection: "row", alignItems: "center", paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: palette.border }}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: palette.foreground }}>{ROLE_NAME[job.role]}</Text>
        <Text style={{ color: palette.muted, fontSize: 12 }}>{model}</Text>
      </View>
      <Text style={{ color, fontSize: 13 }}>{label}</Text>
    </View>
  );
}

function AccountSection() {
  const { palette } = useTheme();
  const account = useAccount();
  if (account.isError) return <Text style={{ color: palette.error }}>{errorText(account.error)}</Text>;
  if (!account.data) return <Loading label="Loading account…" />;
  return (
    <View style={{ gap: 18 }}>
      <DataBanner />
      <AccountCard account={account.data} />
      <Updates account={account.data} />
    </View>
  );
}

function AccountCard({ account }: { account: Account }) {
  const { palette } = useTheme();
  const signIn = useSignIn();
  const signOut = useSignOut();
  const deleteAccount = useDeleteAccount();
  const [email, setEmail] = useState("");
  const [waiting, setWaiting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const poll = usePollSignIn(waiting);
  useEffect(() => {
    if (poll.data?.status === "signed-in") setWaiting(false);
  }, [poll.data]);
  const valid = /.+@.+\..+/.test(email.trim());
  const failure = signIn.error ?? signOut.error ?? deleteAccount.error ?? poll.error;
  return (
    <View style={{ borderRadius: 14, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.card, padding: 14, gap: 12 }}>
      <Text style={{ color: palette.foreground, fontWeight: "600", fontSize: 16 }}>{account.email ?? "Not signed in"}</Text>
      <Text style={{ color: palette.muted, fontSize: 13 }}>
        {account.email ? "Signed in with an email link. This hub only." : "Updates come from GitHub releases until you sign in."}
      </Text>
      {account.email ? (
        <GhostButton label={signOut.isPending ? "Signing out…" : "Sign out"} onPress={() => signOut.mutate()} />
      ) : (
        <>
          <TextField label="Email" value={email} onChangeText={setEmail} placeholder="you@example.com" />
          <PrimaryButton
            label={waiting ? "Waiting for the link…" : "Send sign-in link"}
            disabled={!valid || signIn.isPending || waiting}
            onPress={() => {
              signIn.mutate(email.trim(), { onSuccess: () => setWaiting(true) });
            }}
          />
          {waiting ? <Text style={{ color: palette.muted, fontSize: 13 }}>Check {email.trim()} for the sign-in link. This screen updates when you follow it.</Text> : null}
          {waiting ? <GhostButton label="Cancel" onPress={() => setWaiting(false)} /> : null}
        </>
      )}
      {account.email && confirmDelete ? (
        <View style={{ gap: 8 }}>
          <Text style={{ color: palette.foreground, fontSize: 13 }}>Delete your RivetHub account? Updates switch back to GitHub. Your memory stays on this hub.</Text>
          <GhostButton label="Delete account" danger onPress={() => deleteAccount.mutate(undefined, { onSettled: () => setConfirmDelete(false) })} />
          <GhostButton label="Keep it" onPress={() => setConfirmDelete(false)} />
        </View>
      ) : null}
      {account.email && !confirmDelete ? <GhostButton label="Delete account…" onPress={() => setConfirmDelete(true)} /> : null}
      {failure ? <Text style={{ color: palette.error }}>{errorText(failure)}</Text> : null}
    </View>
  );
}

function Updates({ account }: { account: Account }) {
  const { palette } = useTheme();
  const update = useUpdateAccount();
  return (
    <View style={{ gap: 10 }}>
      <Text style={{ color: palette.foreground, fontWeight: "600" }}>Updates</Text>
      {account.pendingUpdate ? (
        <View style={{ borderRadius: 12, borderWidth: 1, borderColor: alpha(palette.info, 0.4), backgroundColor: alpha(palette.info, 0.12), padding: 12 }}>
          <Text style={{ color: palette.foreground, fontWeight: "600" }}>{account.pendingUpdate.version} is ready</Text>
          <Text style={{ color: palette.muted, fontSize: 13 }}>Downloaded and signature checked. Applies when rh restarts.</Text>
        </View>
      ) : null}
      <View style={{ borderRadius: 14, borderWidth: 1, borderColor: palette.border, overflow: "hidden" }}>
        <InfoRow label="Version" value={account.version} />
        <ChoiceRow
          label="Get updates from"
          value={account.updateSource}
          options={[
            { id: "rivethub-cloud" as const, label: "RivetHub server" },
            { id: "github" as const, label: "GitHub releases" },
          ]}
          onChange={(updateSource) => update.mutate({ updateSource })}
        />
        <ChoiceRow
          label="Channel"
          value={account.channel}
          options={[
            { id: "stable" as const, label: "Stable" },
            { id: "beta" as const, label: "Beta" },
          ]}
          onChange={(channel) => update.mutate({ channel })}
        />
        <Toggle label="Download automatically" hint="New versions download in the background and apply on restart." value={account.autoDownload} onChange={(autoDownload) => update.mutate({ autoDownload })} />
        <Toggle label="Send crash reports" hint="Stack trace, rh version, OS and which job failed. Never memory content, names, paths, tokens or your email." value={account.crashReports} onChange={(crashReports) => update.mutate({ crashReports })} />
        <Toggle label="Send anonymous usage counts" hint="Numbers only, like sessions captured per day." value={account.usageCounts} onChange={(usageCounts) => update.mutate({ usageCounts })} />
      </View>
      {update.error ? <Text style={{ color: palette.error }}>{errorText(update.error)}</Text> : null}
    </View>
  );
}

function Appearance() {
  const { palette, id, setTheme } = useTheme();
  return (
    <View style={{ gap: 10 }}>
      <Text style={{ color: palette.muted, fontSize: 13 }}>Pick a theme. It stays on this phone.</Text>
      {THEMES.map((theme) => {
        const selected = theme.id === id;
        return (
          <Pressable
            key={theme.id}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => setTheme(theme.id as ThemeId)}
            style={{ minHeight: 64, borderRadius: 14, borderWidth: selected ? 2 : 1, borderColor: selected ? palette.primary : palette.border, padding: 14, justifyContent: "center" }}
          >
            <Text style={{ color: palette.foreground, fontWeight: "600" }}>{theme.label}</Text>
            <Text style={{ color: palette.muted, fontSize: 13 }}>{theme.hint}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  const { palette } = useTheme();
  return (
    <View style={{ minHeight: 52, flexDirection: "row", alignItems: "center", paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: palette.border }}>
      <Text style={{ flex: 1, color: palette.foreground }}>{label}</Text>
      <Text style={{ color: palette.muted }}>{value}</Text>
    </View>
  );
}

function ChoiceRow<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: readonly { id: T; label: string }[]; onChange: (id: T) => void }) {
  const { palette } = useTheme();
  return (
    <View style={{ gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: palette.border }}>
      <Text style={{ color: palette.foreground }}>{label}</Text>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {options.map((option) => {
          const selected = option.id === value;
          return (
            <Pressable
              key={option.id}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => onChange(option.id)}
              style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: selected ? palette.primary : palette.border, backgroundColor: selected ? palette.selected : "transparent" }}
            >
              <Text style={{ color: palette.foreground }}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function Toggle({ label, hint, value, onChange }: { label: string; hint: string; value: boolean; onChange: (next: boolean) => void }) {
  const { palette } = useTheme();
  return (
    <Pressable accessibilityRole="switch" accessibilityState={{ checked: value }} onPress={() => onChange(!value)} style={{ minHeight: 64, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: palette.border }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: palette.foreground }}>{label}</Text>
        <Text style={{ color: palette.muted, fontSize: 12, lineHeight: 16 }}>{hint}</Text>
      </View>
      <View style={{ width: 44, height: 26, borderRadius: 13, backgroundColor: value ? palette.primary : palette.input, justifyContent: "center", paddingHorizontal: 3 }}>
        <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: "#fff", alignSelf: value ? "flex-end" : "flex-start" }} />
      </View>
    </Pressable>
  );
}
