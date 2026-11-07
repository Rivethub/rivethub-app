import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { EntityId, Fact, IsoTime } from "@rivethub/contracts";
import { useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { useEntity, useEntityChanges, useSetFact } from "../data/queries";
import { useHub } from "../hub/HubContext";
import { isPinned } from "../hub/pins";
import { openSubject } from "../nav/go";
import type { RootParams } from "../nav/types";
import { useTheme } from "../theme/Theme";
import { BackButton, DataBanner, GhostButton, Loading, PrimaryButton, Screen, Segment, Sheet, TextField } from "../ui/chrome";
import { changeLabel, clock, entityTypeLabel, errorText, shortDate } from "../ui/format";

type Props = NativeStackScreenProps<RootParams, "Entity">;
type Tab = "overview" | "sessions" | "history";

export function EntityScreen({ route, navigation }: Props) {
  const { palette } = useTheme();
  const { pins, togglePin } = useHub();
  const [tab, setTab] = useState<Tab>("overview");
  const [asOfText, setAsOfText] = useState("");
  const [editing, setEditing] = useState<Fact | null>(null);
  const asOf = asOfText.trim();
  const entity = useEntity(route.params.id, asOf ? (asOf as IsoTime) : undefined);
  const changes = useEntityChanges(route.params.id);
  const article = entity.data;
  const pinned = article ? isPinned(pins, "entity", article.id) : false;

  return (
    <Screen>
      <View style={{ flexDirection: "row", alignItems: "center", paddingRight: 8 }}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={{ flex: 1, color: palette.muted, fontSize: 13 }}>{article ? entityTypeLabel(article.type) : "Entity"}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="More"
          disabled={!article}
          onPress={() => {
            if (!article) return;
            Alert.alert(article.title, undefined, [
              { text: pinned ? "Unpin" : "Pin", onPress: () => togglePin({ kind: "entity", id: article.id, title: article.title }) },
              { text: "Close", style: "cancel" },
            ]);
          }}
          style={{ minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" }}
        >
          <Text style={{ color: palette.foreground, fontSize: 18 }}>{pinned ? "★" : "⋯"}</Text>
        </Pressable>
      </View>
      <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
        <TextField label="As of" value={asOfText} onChangeText={setAsOfText} placeholder="Leave empty for now" />
      </View>
      <DataBanner reaching={entity.isFetching && !article} />
      {!article ? (
        <Loading label={entity.isError ? "This entity did not load." : "Loading entity…"} />
      ) : (
        <View style={{ flex: 1 }}>
          <View style={{ paddingHorizontal: 16, gap: 12 }}>
            <Text style={{ fontFamily: "serif", color: palette.foreground, fontSize: 28, fontWeight: "600" }}>{article.title}</Text>
            <Segment
              value={tab}
              onChange={(id) => setTab(id as Tab)}
              options={[
                { id: "overview", label: "Overview" },
                { id: "sessions", label: "Sessions" },
                { id: "history", label: "History" },
              ]}
            />
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 32 }}>
            {tab === "overview" ? (
              <>
                {article.lead ? <Text style={{ fontFamily: "serif", color: palette.foreground, fontSize: 16, lineHeight: 24 }}>{article.lead}</Text> : null}
                <View style={{ borderRadius: 14, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.card, padding: 14, gap: 10 }}>
                  <Text style={{ color: palette.muted, fontSize: 12, fontWeight: "600" }}>STATE</Text>
                  {article.facts.length === 0 ? <Text style={{ color: palette.muted }}>No facts yet.</Text> : null}
                  {article.facts.map((fact) => (
                    <Pressable key={fact.id} accessibilityRole="button" onPress={() => setEditing(fact)} style={{ minHeight: 48, justifyContent: "center", borderTopWidth: 1, borderTopColor: palette.border, paddingTop: 8 }}>
                      <Text style={{ color: palette.muted, fontSize: 12 }}>{fact.key}{fact.pinned ? " · pinned" : ""}{fact.conflict ? " · conflict" : ""}</Text>
                      <Text style={{ color: palette.foreground, fontSize: 16 }}>{fact.value || "Empty"}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            ) : null}
            {tab === "sessions"
              ? article.sessions.map((session) => (
                  <Pressable
                    key={session.id}
                    accessibilityRole="button"
                    onPress={() => openSubject({ kind: "session", id: session.id, title: session.title })}
                    style={{ minHeight: 56, justifyContent: "center", borderBottomWidth: 1, borderBottomColor: palette.border }}
                  >
                    <Text style={{ color: palette.muted, fontSize: 12 }}>{session.harness} · {clock(session.startedAt)}</Text>
                    <Text style={{ color: palette.foreground }}>{session.title}</Text>
                  </Pressable>
                ))
              : null}
            {tab === "history"
              ? (changes.data ?? []).map((change, index) => (
                  <View key={`${change.at}:${index}`} style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: palette.border }}>
                    <Text style={{ color: palette.muted, fontSize: 12 }}>{changeLabel(change.kind)} · {shortDate(change.at)}</Text>
                    <Text style={{ color: palette.foreground }}>{change.text}</Text>
                  </View>
                ))
              : null}
          </ScrollView>
        </View>
      )}
      {editing && article ? <FactSheet entity={article.id} fact={editing} onClose={() => setEditing(null)} /> : null}
    </Screen>
  );
}

function FactSheet({ entity, fact, onClose }: { entity: EntityId; fact: Fact; onClose: () => void }) {
  const { palette } = useTheme();
  const setFact = useSetFact();
  const [value, setValue] = useState(fact.value);
  const [pinned, setPinned] = useState(fact.pinned);
  const [error, setError] = useState<string | null>(null);

  const save = (next: string) => {
    setError(null);
    setFact.mutate(
      { entity, fact: { id: fact.id, key: fact.key, value: next, pinned } },
      { onSuccess: onClose, onError: (caught) => setError(errorText(caught)) },
    );
  };

  return (
    <Sheet title={fact.key} onClose={onClose}>
      <TextField label="Value" value={value} onChangeText={setValue} />
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: pinned }} onPress={() => setPinned((current) => !current)} style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 10 }}>
        <View style={{ width: 22, height: 22, borderRadius: 4, borderWidth: 1, borderColor: palette.border, backgroundColor: pinned ? palette.primary : "transparent", alignItems: "center", justifyContent: "center" }}>
          {pinned ? <Text style={{ color: palette.primaryForeground, fontSize: 14 }}>✓</Text> : null}
        </View>
        <Text style={{ color: palette.foreground }}>Pin</Text>
      </Pressable>
      {error ? <Text style={{ color: palette.error }}>{error}</Text> : null}
      <GhostButton label="Remove" danger onPress={() => save("")} />
      <PrimaryButton label={setFact.isPending ? "Saving…" : "Save"} onPress={() => save(value)} disabled={setFact.isPending} />
    </Sheet>
  );
}
