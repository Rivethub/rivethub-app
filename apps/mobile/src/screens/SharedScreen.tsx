import { longDay, localDay } from "@rivethub/client-runtime/format";
import type { SessionSummaryRow } from "@rivethub/contracts";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSessions } from "../data/queries";
import { openSubject } from "../nav/go";
import type { RootParams } from "../nav/types";
import { useTheme } from "../theme/Theme";
import { BackButton, Loading, Screen } from "../ui/chrome";

type Props = NativeStackScreenProps<RootParams, "Shared">;

function bySpace(rows: SessionSummaryRow[]): { space: string; items: SessionSummaryRow[] }[] {
  const out = new Map<string, SessionSummaryRow[]>();
  for (const row of rows) {
    if (row.visibility.kind !== "space" || row.trashed) continue;
    out.set(row.visibility.space, [...(out.get(row.visibility.space) ?? []), row]);
  }
  return [...out].map(([space, items]) => ({ space, items })).sort((a, b) => a.space.localeCompare(b.space));
}

export function SharedScreen({ navigation }: Props) {
  const { palette } = useTheme();
  const list = useSessions({ view: "all" });
  const spaces = bySpace(list.data?.items ?? []);
  return (
    <Screen>
      <View style={{ flexDirection: "row", alignItems: "center", paddingRight: 16 }}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={{ color: palette.foreground, fontSize: 17, fontWeight: "600" }}>Shared</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 22, paddingBottom: 40 }}>
        <Text style={{ color: palette.muted, fontSize: 15, lineHeight: 22 }}>
          Everything is private to you until you share it. There are two ways, and you choose per session.
        </Text>
        <View style={{ gap: 10 }}>
          <Text style={{ color: palette.foreground, fontSize: 15, fontWeight: "600" }}>With a space on this hub</Text>
          <Text style={{ color: palette.muted, fontSize: 13, lineHeight: 18 }}>
            People in the space, and their agents, can find the session. It stays where it is, and you can make it private again.
          </Text>
          {list.isPending && !list.data ? (
            <Loading label="Loading sessions…" />
          ) : spaces.length === 0 ? (
            <Text style={{ color: palette.muted, fontSize: 14, lineHeight: 20, borderWidth: 1, borderStyle: "dashed", borderColor: palette.input, borderRadius: 12, padding: 14 }}>
              Nothing is shared with a space yet. Open a session and change Shared with in its Share sheet.
            </Text>
          ) : (
            spaces.map((group) => (
              <View key={group.space} style={{ gap: 8, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.card, borderRadius: 12, padding: 14 }}>
                <Text style={{ color: palette.foreground, fontWeight: "600" }}>
                  {group.space}{" "}
                  <Text style={{ color: palette.muted, fontWeight: "400", fontSize: 12 }}>
                    {group.items.length} {group.items.length === 1 ? "session" : "sessions"}
                  </Text>
                </Text>
                {group.items.map((session) => (
                  <Pressable
                    key={session.id}
                    accessibilityRole="button"
                    onPress={() => openSubject({ kind: "session", id: session.id, title: session.title })}
                    style={{ minHeight: 48, justifyContent: "center", borderTopWidth: 1, borderTopColor: palette.border }}
                  >
                    <Text style={{ color: palette.foreground }} numberOfLines={1}>{session.title}</Text>
                    <Text style={{ color: palette.muted, fontSize: 12 }}>{longDay(localDay(new Date(session.startedAt)))}</Text>
                  </Pressable>
                ))}
              </View>
            ))
          )}
        </View>
        <View style={{ gap: 10 }}>
          <Text style={{ color: palette.foreground, fontSize: 15, fontWeight: "600" }}>With another RivetHub</Text>
          <Text style={{ color: palette.muted, fontSize: 13, lineHeight: 18 }}>
            For a friend, your family or a team that runs its own. You choose the sessions, secrets are scrubbed on this machine, and you send a one-time code.
          </Text>
          <View style={{ gap: 10 }}>
            <View style={{ gap: 6, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.card, borderRadius: 12, padding: 14 }}>
              <Text style={{ color: palette.foreground, fontWeight: "600" }}>Send sessions</Text>
              <Text style={{ color: palette.muted, fontSize: 13, lineHeight: 18 }}>Approve, redact or leave out each session, check what the scrubber flagged, then get a code to pass on privately.</Text>
            </View>
            <View style={{ gap: 6, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.card, borderRadius: 12, padding: 14 }}>
              <Text style={{ color: palette.foreground, fontWeight: "600" }}>Receive sessions</Text>
              <Text style={{ color: palette.muted, fontSize: 13, lineHeight: 18 }}>Paste a code someone sent you. You see who it is from and what was held back before anything is imported.</Text>
            </View>
          </View>
          <Text style={{ color: palette.muted, fontSize: 13, lineHeight: 18 }}>
            Sending and receiving run in the desktop app, next to your own rh, so nothing leaves the machine before it is scrubbed.
          </Text>
        </View>
      </ScrollView>
    </Screen>
  );
}
