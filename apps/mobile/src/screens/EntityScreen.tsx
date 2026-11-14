import { factLabel, harnessNames } from "@rivethub/client-runtime/format";
import { articleBody } from "@rivethub/client-runtime/markdown";
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
import { BackButton, DataBanner, GhostButton, Loading, PrimaryButton, RichText, Screen, Segment, Sheet, TextField } from "../ui/chrome";
import { MarkdownView } from "../ui/markdown";
import { changeLabel, entityTypeLabel, errorText, shortDate, when } from "../ui/format";

type Props = NativeStackScreenProps<RootParams, "Entity">;
type Tab = "overview" | "sessions" | "history";

export function EntityScreen({ route, navigation }: Props) {
  const { palette } = useTheme();
  const { pins, togglePin } = useHub();
  const [tab, setTab] = useState<Tab>("overview");
  const [asOf, setAsOf] = useState<IsoTime | null>(null);
  const [editing, setEditing] = useState<Fact | null>(null);
  const entity = useEntity(route.params.id, asOf ?? undefined);
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
      <DataBanner reaching={entity.isFetching && !article} />
      {!article ? (
        <Loading label={entity.isError ? "This entity did not load." : "Loading entity…"} />
      ) : (
        <View style={{ flex: 1 }}>
          <View style={{ paddingHorizontal: 16, gap: 12 }}>
            <Text style={{ fontFamily: palette.reading, color: palette.foreground, fontSize: 28, fontWeight: "600" }}>{article.title}</Text>
            <Text style={{ color: palette.muted, fontSize: 13 }}>
              {entityTypeLabel(article.type)}
              {article.lastVerified ? ` · last checked ${shortDate(article.lastVerified)}` : ""}
              {article.topic ? ` · ${article.topic.path.join(" › ")}` : ""}
            </Text>
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
                {asOf ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 12, borderWidth: 1, borderColor: palette.border, paddingLeft: 14 }}>
                    <Text style={{ flex: 1, color: palette.foreground }}>State as of {shortDate(asOf)}</Text>
                    <Pressable accessibilityRole="button" onPress={() => setAsOf(null)} style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 14 }}>
                      <Text style={{ color: palette.info }}>Back to now</Text>
                    </Pressable>
                  </View>
                ) : null}
                {article.lead ? <RichText text={article.lead} style={{ fontFamily: palette.reading, color: palette.foreground, fontSize: 16, lineHeight: 24 }} /> : null}
                {article.article ? (
                  <MarkdownView source={articleBody(article.article, article.title, { dropFacts: article.facts.length > 0, dropLead: article.lead })} />
                ) : null}
                <View style={{ borderRadius: 14, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.card, padding: 14, gap: 10 }}>
                  <Text style={{ color: palette.muted, fontSize: 12, fontWeight: "600" }}>STATE</Text>
                  {article.facts.length === 0 ? <Text style={{ color: palette.muted }}>No facts yet.</Text> : null}
                  {article.facts.map((fact) => (
                    <Pressable key={fact.id} accessibilityRole="button" disabled={asOf !== null} onPress={() => setEditing(fact)} style={{ minHeight: 48, justifyContent: "center", borderTopWidth: 1, borderTopColor: palette.border, paddingTop: 8 }}>
                      <Text style={{ color: palette.muted, fontSize: 12 }}>{factLabel(fact.key)}{fact.pinned ? " · pinned" : ""}{fact.conflict ? " · conflict" : ""}</Text>
                      <Text style={{ color: palette.foreground, fontSize: 16 }}>{fact.value || "Empty"}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            ) : null}
            {tab === "sessions" && article.sessions.length === 0 ? <Text style={{ color: palette.muted }}>No sessions mention {article.title} yet.</Text> : null}
            {tab === "sessions"
              ? article.sessions.map((session) => (
                  <Pressable
                    key={session.id}
                    accessibilityRole="button"
                    onPress={() => openSubject({ kind: "session", id: session.id, title: session.title })}
                    style={{ minHeight: 56, justifyContent: "center", borderBottomWidth: 1, borderBottomColor: palette.border }}
                  >
                    <Text style={{ color: palette.muted, fontSize: 12 }}>{harnessNames[session.harness] ?? session.harness} · {when(session.startedAt)}</Text>
                    <Text style={{ color: palette.foreground }}>{session.title}</Text>
                  </Pressable>
                ))
              : null}
            {tab === "history" && changes.data?.length === 0 ? <Text style={{ color: palette.muted }}>Nothing has changed yet.</Text> : null}
            {tab === "history"
              ? (changes.data ?? []).map((change, index) => (
                  <Pressable
                    key={`${change.at}:${index}`}
                    accessibilityRole="button"
                    accessibilityHint="Shows the state as of this change"
                    onPress={() => {
                      setAsOf(change.at);
                      setTab("overview");
                    }}
                    style={{ minHeight: 48, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: palette.border }}
                  >
                    <Text style={{ color: palette.muted, fontSize: 12 }}>{changeLabel(change.kind)} · {shortDate(change.at)}</Text>
                    <RichText text={change.text} style={{ color: palette.foreground }} />
                  </Pressable>
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
    <Sheet title={factLabel(fact.key)} onClose={onClose}>
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
