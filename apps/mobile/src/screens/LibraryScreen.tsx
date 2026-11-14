import { entityTypes, harnessNames, originLabel } from "@rivethub/client-runtime/format";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { EntitySummary, EntityType, HarnessId, SessionQuery, SessionSummaryRow, TopicNode } from "@rivethub/contracts";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useEntities, useHarnesses, useSessionPages, useSessions, useTopicTree } from "../data/queries";
import { useHub } from "../hub/HubContext";
import { quietSessionNote, showsMessageCount, visibleSessions } from "../lib/sessions";
import { openSubject } from "../nav/go";
import type { LibrarySegment, TabParams } from "../nav/types";
import { useTheme } from "../theme/Theme";
import { DataBanner, HubChip, KindTag, Screen } from "../ui/chrome";
import { clock, count, dayKey, longDate } from "../ui/format";
import { NewTopic } from "./NewTopic";

type Props = BottomTabScreenProps<TabParams, "Library">;
type SessionView = NonNullable<SessionQuery["view"]>;

const TYPE_ORDER: EntityType[] = ["machine", "service", "person", "repository", "model", "database", "software", "hardware", "agent", "domain"];

const STATE: Partial<Record<SessionSummaryRow["memoryState"], { label: string; tone: "info" | "muted" | "error" }>> = {
  capturing: { label: "Capturing", tone: "info" },
  queued: { label: "Not summarized yet", tone: "muted" },
  flagged: { label: "Summary failed", tone: "error" },
};

const EMPTY: Record<SessionView, string> = {
  all: "No sessions match. A session shows up here when a connected tool finishes a turn.",
  unfiled: "Every session has a topic.",
  kept: "Nothing is kept. Keep a session to protect it from clean-up.",
  trash: "The trash is empty.",
};

export function LibraryScreen({ route }: Props) {
  const { palette } = useTheme();
  const [segment, setSegment] = useState<LibrarySegment>(route.params?.segment ?? "topics");
  useEffect(() => {
    if (route.params?.segment) setSegment(route.params.segment);
  }, [route.params?.segment]);
  const topics = useTopicTree();
  const entities = useEntities();
  const reaching = (segment === "topics" ? topics : entities).isPlaceholderData && (segment === "topics" ? topics : entities).isFetching;
  return (
    <Screen>
      <View style={{ flex: 1 }}>
        <View style={{ gap: 12, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text style={{ flex: 1, color: palette.foreground, fontSize: 22, fontWeight: "600" }}>Library</Text>
            <HubChip />
          </View>
          <View style={{ flexDirection: "row", padding: 3, borderRadius: 10, backgroundColor: palette.card }}>
            {(["topics", "entities", "sessions"] as const).map((id) => {
              const selected = segment === id;
              return (
                <Pressable
                  key={id}
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                  onPress={() => setSegment(id)}
                  style={{ flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: selected ? palette.background : "transparent" }}
                >
                  <Text style={{ color: selected ? palette.foreground : palette.muted, fontSize: 13, fontWeight: selected ? "600" : "400" }}>
                    {id === "topics" ? "Topics" : id === "entities" ? "Entities" : "Sessions"}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        <DataBanner reaching={reaching} />
        {segment === "topics" ? <Topics tree={topics.data ?? []} /> : null}
        {segment === "entities" ? <Entities /> : null}
        {segment === "sessions" ? <Sessions /> : null}
      </View>
    </Screen>
  );
}

function Topics({ tree }: { tree: TopicNode[] }) {
  const { palette } = useTheme();
  const { pins } = useHub();
  const [open, setOpen] = useState<Set<string> | null>(null);
  const expanded = open ?? new Set(tree.filter((node) => node.children.length > 0).map((node) => node.id));
  const rows = flatten(tree, expanded, 0);
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingRight: 8 }}>
        <Text style={{ flex: 1, paddingHorizontal: 16, paddingTop: 8, color: palette.muted, fontSize: 12, fontWeight: "600" }}>ALL TOPICS</Text>
        <NewTopic onCreated={(id) => openSubject({ kind: "topic", id, title: "Topic" })} />
      </View>
      {pins.length > 0 ? (
        <>
          <Text style={{ paddingHorizontal: 16, paddingTop: 8, color: palette.muted, fontSize: 12, fontWeight: "600" }}>PINNED</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingVertical: 8 }}>
            {pins.map((pin) => (
              <Pressable key={`${pin.kind}:${pin.id}`} accessibilityRole="button" onPress={() => openSubject(pin)} style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 12, borderRadius: 10, backgroundColor: palette.card }}>
                <Text style={{ color: palette.foreground }}>{pin.title}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </>
      ) : null}
      {rows.length === 0 ? (
        <Text style={{ color: palette.muted, padding: 16, lineHeight: 20 }}>
          No topics yet. Topics appear when sessions are filed. With a model set, RivetHub files each session for you. Without one, create a topic and file sessions from each session.
        </Text>
      ) : null}
      {rows.map(({ node, depth }) => {
        const hasChildren = node.children.length > 0;
        const isOpen = expanded.has(node.id);
        return (
          <View key={node.id} style={{ flexDirection: "row", alignItems: "center", minHeight: 48, paddingRight: 8, paddingLeft: 12 + depth * 18, borderBottomWidth: 1, borderBottomColor: palette.border }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={hasChildren ? (isOpen ? "Collapse" : "Expand") : node.name}
              onPress={() => {
                if (!hasChildren) {
                  openSubject({ kind: "topic", id: node.id, title: node.name });
                  return;
                }
                const next = new Set(expanded);
                if (next.has(node.id)) next.delete(node.id);
                else next.add(node.id);
                setOpen(next);
              }}
              style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}
            >
              <Text style={{ color: palette.muted, fontSize: 12 }}>{hasChildren ? (isOpen ? "▾" : "▸") : ""}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => openSubject({ kind: "topic", id: node.id, title: node.name })} style={{ flex: 1, minHeight: 48, justifyContent: "center" }}>
              <Text style={{ color: palette.foreground, fontWeight: depth === 0 ? "600" : "400" }}>{node.name}</Text>
              <Text style={{ color: palette.muted, fontSize: 12 }}>{count(node.sessionCount, "session")} · {node.status}</Text>
            </Pressable>
            <Text style={{ color: palette.muted }}>›</Text>
          </View>
        );
      })}
    </ScrollView>
  );
}

function Entities() {
  const { palette } = useTheme();
  const entities = useEntities();
  const all = entities.data ?? [];
  const [text, setText] = useState("");
  const [only, setOnly] = useState<EntityType | "">("");
  const [sort, setSort] = useState<"name" | "sessions">("name");
  const types = TYPE_ORDER.map((type) => ({ type, items: all.filter((entity) => entity.type === type) })).filter((group) => group.items.length);
  const needle = text.trim().toLowerCase();
  const shown = all
    .filter((entity) => (!only || entity.type === only) && (!needle || entity.title.toLowerCase().includes(needle)))
    .sort((left, right) => (sort === "sessions" ? right.sessionCount - left.sessionCount : 0) || left.title.localeCompare(right.title, undefined, { sensitivity: "base" }));
  const groups = TYPE_ORDER.map((type) => ({ type, items: shown.filter((entity) => entity.type === type) })).filter((group) => group.items.length);
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
      {all.length > 0 ? (
        <View style={{ gap: 8, paddingBottom: 4 }}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={`Filter ${all.length.toLocaleString("en-US")} entities`}
            placeholderTextColor={palette.muted}
            accessibilityLabel="Filter entities"
            autoCapitalize="none"
            autoCorrect={false}
            style={{ marginHorizontal: 16, minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.card, color: palette.foreground, paddingHorizontal: 12 }}
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingHorizontal: 16 }}>
            <SortChip label="A to Z" selected={sort === "name"} onPress={() => setSort("name")} />
            <SortChip label="Most sessions" selected={sort === "sessions"} onPress={() => setSort("sessions")} />
          </ScrollView>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingHorizontal: 16 }}>
            <SortChip label={`All ${all.length.toLocaleString("en-US")}`} selected={only === ""} onPress={() => setOnly("")} />
            {types.map((group) => (
              <SortChip
                key={group.type}
                label={`${entityTypes[group.type].many} ${group.items.length}`}
                selected={only === group.type}
                onPress={() => setOnly(only === group.type ? "" : group.type)}
              />
            ))}
          </ScrollView>
        </View>
      ) : null}
      {all.length === 0 ? (
        <Text style={{ color: palette.muted, padding: 16, lineHeight: 20 }}>
          No entities yet. Entities are the machines, services, people and repositories your sessions mention. RivetHub picks them out once a model is set.
        </Text>
      ) : shown.length === 0 ? (
        <Pressable accessibilityRole="button" onPress={() => { setText(""); setOnly(""); }} style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 16 }}>
          <Text style={{ color: palette.muted }}>No entity matches. <Text style={{ color: palette.info }}>Clear the filter</Text></Text>
        </Pressable>
      ) : (
        groups.map((group) => (
          <View key={group.type}>
            <Text style={{ paddingHorizontal: 16, paddingTop: 12, color: palette.muted, fontSize: 12, fontWeight: "600" }}>
              {entityTypes[group.type].many.toUpperCase()} {group.items.length}
            </Text>
            {group.items.map((entity) => (
              <EntityRow key={entity.id} entity={entity} />
            ))}
          </View>
        ))
      )}
    </ScrollView>
  );
}

function EntityRow({ entity }: { entity: EntitySummary }) {
  const { palette } = useTheme();
  return (
    <Pressable accessibilityRole="button" onPress={() => openSubject({ kind: "entity", id: entity.id, title: entity.title })} style={{ minHeight: 56, flexDirection: "row", alignItems: "center", paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: palette.border }}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: palette.foreground, fontWeight: "500" }}>{entity.title}</Text>
        {entity.sessionCount > 0 ? <Text style={{ color: palette.muted, fontSize: 12 }}>{count(entity.sessionCount, "session")}</Text> : null}
      </View>
      <Text style={{ color: palette.muted }}>›</Text>
    </Pressable>
  );
}

function Sessions() {
  const { palette } = useTheme();
  const [view, setView] = useState<SessionView>("all");
  const [text, setText] = useState("");
  const [harness, setHarness] = useState("");
  const [showQuiet, setShowQuiet] = useState(false);
  const unfiled = useSessions({ view: "unfiled" }).data?.items.length;
  const tools = (useHarnesses().data ?? []).filter((item) => item.capture.state === "receiving" || item.capture.state === "stale");
  const query = useMemo(() => {
    const next: SessionQuery = { view };
    const trimmed = text.trim();
    if (trimmed) next.text = trimmed;
    if (harness) next.harness = harness as HarnessId;
    return next;
  }, [view, text, harness]);
  const pages = useSessionPages(query);
  const items = useMemo(() => pages.data?.pages.flatMap((page) => page.items) ?? [], [pages.data]);
  const { shown, hidden } = visibleSessions(items, showQuiet || view === "trash");
  const groups = groupSessions(shown);
  const note = view === "trash" ? null : quietSessionNote(hidden, showQuiet);
  const filtered = text.trim().length > 0 || harness.length > 0;
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder="Filter by title or topic"
        placeholderTextColor={palette.muted}
        accessibilityLabel="Filter sessions"
        autoCapitalize="none"
        autoCorrect={false}
        style={{ marginHorizontal: 16, minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.card, color: palette.foreground, paddingHorizontal: 12 }}
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingHorizontal: 16, paddingVertical: 8 }}>
        {(["all", "unfiled", "kept", "trash"] as const).map((id) => (
          <SortChip
            key={id}
            label={id === "all" ? "All" : id === "unfiled" ? `Unfiled${unfiled ? ` ${unfiled}` : ""}` : id === "kept" ? "Kept" : "Trash"}
            selected={view === id}
            onPress={() => {
              setView(id);
              setShowQuiet(false);
            }}
          />
        ))}
      </ScrollView>
      {tools.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingHorizontal: 16, paddingBottom: 8 }}>
          <SortChip label="Every tool" selected={harness === ""} onPress={() => setHarness("")} />
          {tools.map((tool) => (
            <SortChip key={tool.id} label={tool.name} selected={harness === tool.id} onPress={() => setHarness(harness === tool.id ? "" : tool.id)} />
          ))}
        </ScrollView>
      ) : null}
      {pages.isPending && !pages.data ? <Text style={{ color: palette.muted, padding: 16 }}>Loading sessions…</Text> : null}
      {pages.isError ? <Text style={{ color: palette.error, padding: 16 }}>The session list did not load.</Text> : null}
      {groups.map((group) => (
        <View key={group.day}>
          <Text style={{ paddingHorizontal: 16, paddingTop: 10, color: palette.muted, fontSize: 12, fontWeight: "600" }}>
            {group.day === dayKey(new Date().toISOString()) ? "TODAY" : longDate(group.day).toUpperCase()}
          </Text>
          {group.items.map((session) => (
            <SessionRow key={session.id} session={session} />
          ))}
        </View>
      ))}
      {note ? (
        <Pressable accessibilityRole="button" onPress={() => setShowQuiet((current) => !current)} style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 16, paddingTop: 8 }}>
          <Text style={{ color: palette.muted, fontSize: 13 }}>
            {note} <Text style={{ color: palette.info }}>{showQuiet ? "Hide them" : "Show them"}</Text>
          </Text>
        </Pressable>
      ) : null}
      {!pages.isPending && !pages.isError && shown.length === 0 ? (
        <Text style={{ color: palette.muted, padding: 16 }}>{filtered ? "No sessions match these filters." : EMPTY[view]}</Text>
      ) : null}
      {pages.hasNextPage ? (
        <Pressable accessibilityRole="button" disabled={pages.isFetchingNextPage} onPress={() => void pages.fetchNextPage()} style={{ minHeight: 48, alignItems: "center", justifyContent: "center", margin: 16, borderRadius: 12, borderWidth: 1, borderColor: palette.border }}>
          <Text style={{ color: palette.foreground }}>{pages.isFetchingNextPage ? "Loading…" : "Show older sessions"}</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

function SessionRow({ session }: { session: SessionSummaryRow }) {
  const { palette } = useTheme();
  const state = STATE[session.memoryState];
  const tone = state?.tone === "error" ? palette.error : state?.tone === "info" ? palette.info : palette.muted;
  return (
    <Pressable accessibilityRole="button" onPress={() => openSubject({ kind: "session", id: session.id, title: session.title })} style={{ minHeight: 72, justifyContent: "center", gap: 3, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: palette.border }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
        <Text style={{ color: palette.foreground, fontWeight: "600", flexShrink: 1 }} numberOfLines={2}>{session.title}</Text>
        {session.origin ? <KindTag label={originLabel(session.origin)} color={palette.info} /> : null}
        {session.kept ? <KindTag label="Kept" color={palette.primary} /> : null}
        {state ? <KindTag label={state.label} color={tone} /> : null}
      </View>
      {session.gist ? <Text style={{ color: palette.muted, fontSize: 13, lineHeight: 18 }} numberOfLines={2}>{session.gist}</Text> : null}
      <Text style={{ color: palette.muted, fontSize: 12 }}>
        {clock(session.startedAt)} · {harnessNames[session.harness] ?? session.harness}
        {" · "}
        <Text style={{ color: session.topic ? palette.muted : palette.warning }}>{session.topic ? session.topic.path.join(" › ") : "Unfiled"}</Text>
        {showsMessageCount(session) ? ` · ${count(session.messageCount, "message")}` : ""}
      </Text>
    </Pressable>
  );
}

function SortChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const { palette } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={{ minHeight: 44, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: palette.border, backgroundColor: selected ? palette.selected : "transparent", justifyContent: "center" }}>
      <Text style={{ color: palette.foreground, fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

function flatten(nodes: TopicNode[], open: Set<string>, depth: number): { node: TopicNode; depth: number }[] {
  const rows: { node: TopicNode; depth: number }[] = [];
  for (const node of nodes) {
    rows.push({ node, depth });
    if (node.children.length > 0 && open.has(node.id)) rows.push(...flatten(node.children, open, depth + 1));
  }
  return rows;
}

function groupSessions<T extends { startedAt: string }>(items: T[]): { day: string; items: T[] }[] {
  const groups: { day: string; items: typeof items }[] = [];
  for (const item of items) {
    const day = dayKey(item.startedAt);
    const last = groups.at(-1);
    if (last?.day === day) last.items.push(item);
    else groups.push({ day, items: [item] });
  }
  return groups;
}
