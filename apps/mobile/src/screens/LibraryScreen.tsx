import type { SessionQuery, TopicNode } from "@rivethub/contracts";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useEntities, useSessions, useTopicTree } from "../data/queries";
import { useHub } from "../hub/HubContext";
import { openSubject } from "../nav/go";
import { useTheme } from "../theme/Theme";
import { DataBanner, HubChip, Screen, Segment } from "../ui/chrome";
import { clock, dayKey, entityTypeLabel, longDate } from "../ui/format";

type SegmentId = "topics" | "entities" | "sessions";
type SessionView = NonNullable<SessionQuery["view"]>;

export function LibraryScreen() {
  const { palette } = useTheme();
  const [segment, setSegment] = useState<SegmentId>("topics");
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
          <Segment
            value={segment}
            onChange={(id) => setSegment(id as SegmentId)}
            options={[
              { id: "topics", label: "Topics" },
              { id: "entities", label: "Entities" },
              { id: "sessions", label: "Sessions" },
            ]}
          />
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
      <Text style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4, color: palette.muted, fontSize: 12, fontWeight: "600" }}>ALL TOPICS</Text>
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
              <Text style={{ color: palette.muted, fontSize: 12 }}>{node.sessionCount} sessions · {node.status}</Text>
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
  const rows = entities.data ?? [];
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
      {rows.map((entity) => (
        <Pressable key={entity.id} accessibilityRole="button" onPress={() => openSubject({ kind: "entity", id: entity.id, title: entity.title })} style={{ minHeight: 56, flexDirection: "row", alignItems: "center", paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: palette.border }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: palette.foreground, fontWeight: "500" }}>{entity.title}</Text>
            <Text style={{ color: palette.muted, fontSize: 12 }}>{entityTypeLabel(entity.type)} · {entity.sessionCount} sessions</Text>
          </View>
          <Text style={{ color: palette.muted }}>›</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

function Sessions() {
  const { palette } = useTheme();
  const [view, setView] = useState<SessionView>("all");
  const [text, setText] = useState("");
  const query = useMemo(() => sessionQuery(view, text), [view, text]);
  const sessions = useSessions(query);
  const items = sessions.data?.items ?? [];
  const groups = groupSessions(items);
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
      <DataBanner reaching={sessions.isPlaceholderData && sessions.isFetching} />
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder="Filter by title, harness, topic…"
        placeholderTextColor={palette.muted}
        accessibilityLabel="Filter sessions"
        style={{ marginHorizontal: 16, minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.card, color: palette.foreground, paddingHorizontal: 12 }}
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingHorizontal: 16, paddingVertical: 8 }}>
        {(["all", "unfiled", "kept", "trash"] as const).map((id) => (
          <Pressable key={id} accessibilityRole="button" accessibilityState={{ selected: view === id }} onPress={() => setView(id)} style={{ minHeight: 44, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: palette.border, backgroundColor: view === id ? palette.selected : "transparent", justifyContent: "center" }}>
            <Text style={{ color: palette.foreground, fontSize: 13 }}>{id === "all" ? "All" : id === "unfiled" ? "Unfiled" : id === "kept" ? "Kept" : "Trash"}</Text>
          </Pressable>
        ))}
      </ScrollView>
      {groups.map((group) => (
        <View key={group.day}>
          <Text style={{ paddingHorizontal: 16, paddingTop: 10, color: palette.muted, fontSize: 12, fontWeight: "600" }}>{longDate(group.day).toUpperCase()}</Text>
          {group.items.map((session) => (
            <Pressable key={session.id} accessibilityRole="button" onPress={() => openSubject({ kind: "session", id: session.id, title: session.title })} style={{ minHeight: 64, justifyContent: "center", paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: palette.border }}>
              <Text style={{ color: palette.muted, fontSize: 12 }}>{session.harness} · {clock(session.startedAt)}</Text>
              <Text style={{ color: palette.foreground }}>{session.title}</Text>
              <Text style={{ color: session.topic ? palette.muted : palette.warning, fontSize: 12 }}>{session.topic ? session.topic.path.slice(-2).join(" › ") : "Unfiled"}</Text>
            </Pressable>
          ))}
        </View>
      ))}
      {items.length === 0 ? <Text style={{ color: palette.muted, padding: 16 }}>No sessions here.</Text> : null}
    </ScrollView>
  );
}

function sessionQuery(view: SessionView, text: string): SessionQuery {
  const query: SessionQuery = { view };
  const trimmed = text.trim();
  if (trimmed) query.text = trimmed;
  return query;
}

function flatten(nodes: TopicNode[], open: Set<string>, depth: number): { node: TopicNode; depth: number }[] {
  const rows: { node: TopicNode; depth: number }[] = [];
  for (const node of nodes) {
    rows.push({ node, depth });
    if (node.children.length > 0 && open.has(node.id)) rows.push(...flatten(node.children, open, depth + 1));
  }
  return rows;
}

function groupSessions<T extends { id: string; startedAt: string }>(items: T[]): { day: string; items: T[] }[] {
  const groups: { day: string; items: typeof items }[] = [];
  for (const item of items) {
    const day = dayKey(item.startedAt);
    const last = groups.at(-1);
    if (last?.day === day) last.items.push(item);
    else groups.push({ day, items: [item] });
  }
  return groups;
}
