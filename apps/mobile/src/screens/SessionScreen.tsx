import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { SessionDetail, SessionId, SummaryNode, TopicId, TopicNode, TranscriptTurn } from "@rivethub/contracts";
import { splitInjected } from "@rivethub/client";
import * as Clipboard from "expo-clipboard";
import { useState, type ReactNode } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useKeep, usePlaceSession, useRestore, useSession, useSetVisibility, useSummaryTree, useTopicTree, useTranscript, useTrash } from "../data/queries";
import type { RootParams } from "../nav/types";
import { useTheme } from "../theme/Theme";
import { BackButton, DataBanner, GhostButton, KindTag, Loading, PrimaryButton, RichText, Screen, Segment, Sheet, TextField } from "../ui/chrome";
import { changeLabel, clock, errorText, shortDate } from "../ui/format";
import { IconFile, IconKeep, IconShare, IconTrash } from "../ui/icons";

type Props = NativeStackScreenProps<RootParams, "Session">;
type Pane = "transcript" | "summary";

export function SessionScreen({ route, navigation }: Props) {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const id = route.params.id as SessionId;
  const session = useSession(route.params.id);
  const detail = session.data;
  const [pane, setPane] = useState<Pane>("transcript");
  const [range, setRange] = useState<[number, number] | null>(null);
  const [filing, setFiling] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [copied, setCopied] = useState(false);
  const trash = useTrash();
  const restore = useRestore();
  const keep = useKeep();

  const resume = async () => {
    if (!detail?.resumeCommand) return;
    await Clipboard.setStringAsync(detail.resumeCommand);
    setCopied(true);
  };

  const onTrash = () => {
    if (!detail) return;
    if (detail.trashed) {
      restore.mutate([detail.id], { onError: (error) => Alert.alert("Could not restore", errorText(error)) });
      return;
    }
    Alert.alert("Move to trash?", "You can restore this session later. Nothing is deleted for good.", [
      { text: "Cancel", style: "cancel" },
      { text: "Trash", style: "destructive", onPress: () => trash.mutate([detail.id], { onError: (error) => Alert.alert("Could not trash", errorText(error)) }) },
    ]);
  };

  return (
    <Screen>
      <View style={{ flexDirection: "row", alignItems: "center", paddingRight: 12 }}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={{ flex: 1, color: palette.muted, fontSize: 13 }} numberOfLines={1}>
          {detail ? `${detail.harness} · ${shortDate(detail.startedAt)}` : "Session"}
        </Text>
        {detail?.resumeCommand ? (
          <Pressable accessibilityRole="button" onPress={() => void resume()} style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 8 }}>
            <Text style={{ color: palette.info }}>{copied ? "Copied" : "Resume"}</Text>
          </Pressable>
        ) : null}
      </View>
      <DataBanner reaching={session.isFetching && !detail} />
      {!detail ? (
        <Loading label={session.isError ? "This session did not load." : "Loading session…"} />
      ) : (
        <View style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 24 }}>
            <Text style={{ fontFamily: "serif", color: palette.foreground, fontSize: 26, fontWeight: "600" }}>{detail.title}</Text>
            {detail.changed.length > 0 ? (
              <View style={{ borderRadius: 14, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.card, padding: 14, gap: 8 }}>
                <Text style={{ color: palette.muted, fontSize: 12, fontWeight: "600" }}>CHANGED {detail.changed.length}</Text>
                {detail.changed.map((change, index) => (
                  <Text key={`${change.at}:${index}`} style={{ color: palette.foreground }}>
                    {changeLabel(change.kind)} · {change.text}
                  </Text>
                ))}
              </View>
            ) : null}
            <Segment
              value={pane}
              onChange={(next) => setPane(next as Pane)}
              options={[
                { id: "transcript", label: "Transcript" },
                { id: "summary", label: "Summary" },
              ]}
            />
            {pane === "transcript" ? <Transcript id={detail.id} range={range} onClear={() => setRange(null)} /> : null}
            {pane === "summary" ? (
              <Summary
                id={detail.id}
                state={detail.memoryState}
                onLeaf={(next) => {
                  setRange(next);
                  setPane("transcript");
                }}
              />
            ) : null}
          </ScrollView>
          <View style={{ flexDirection: "row", borderTopWidth: 1, borderTopColor: palette.border, backgroundColor: palette.sidebar, paddingBottom: insets.bottom }}>
            <Action label="File" onPress={() => setFiling(true)} icon={<IconFile color={palette.foreground} />} />
            <Action
              label={detail.visibility.kind === "space" ? detail.visibility.space : "Share"}
              onPress={() => setSharing(true)}
              icon={<IconShare color={palette.foreground} />}
            />
            <Action
              label={detail.kept ? "Kept" : "Keep"}
              onPress={() => keep.mutate({ id: detail.id, keep: !detail.kept }, { onError: (error) => Alert.alert("Could not update", errorText(error)) })}
              icon={<IconKeep color={detail.kept ? palette.primary : palette.foreground} />}
            />
            <Action label={detail.trashed ? "Restore" : "Trash"} onPress={onTrash} icon={<IconTrash color={detail.trashed ? palette.warning : palette.foreground} />} />
          </View>
          {filing ? <FileSheet session={detail.id} current={detail.topic?.id ?? null} onClose={() => setFiling(false)} /> : null}
          {sharing ? (
            <ShareSheet
              session={detail.id}
              space={detail.visibility.kind === "space" ? detail.visibility.space : ""}
              onClose={() => setSharing(false)}
            />
          ) : null}
        </View>
      )}
    </Screen>
  );
}

function Action({ label, onPress, icon }: { label: string; onPress: () => void; icon: ReactNode }) {
  const { palette } = useTheme();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={{ flex: 1, minHeight: 56, alignItems: "center", justifyContent: "center", gap: 2 }}>
      {icon}
      <Text style={{ color: palette.foreground, fontSize: 11 }} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

function Transcript({ id, range, onClear }: { id: SessionId; range: [number, number] | null; onClear: () => void }) {
  const { palette } = useTheme();
  const transcript = useTranscript(id);
  const turns = transcript.data?.filter((turn) => !range || (turn.index >= range[0] && turn.index <= range[1])) ?? [];
  if (!transcript.data) return <Loading label={transcript.isError ? "The transcript did not load." : "Loading transcript…"} />;
  return (
    <View style={{ gap: 10 }}>
      {range ? (
        <Pressable accessibilityRole="button" onPress={onClear} style={{ minHeight: 44, justifyContent: "center" }}>
          <Text style={{ color: palette.info }}>Showing messages {range[0]}–{range[1]}. Clear</Text>
        </Pressable>
      ) : null}
      {turns.map((turn) => (
        <Bubble key={turn.index} turn={turn} />
      ))}
    </View>
  );
}

const LONG_TURN = 1200;

type Shown = { key: string; kind: "said" | "tool"; text: string };

function Bubble({ turn }: { turn: TranscriptTurn }) {
  const { palette } = useTheme();
  const [contextOpen, setContextOpen] = useState(false);
  const [full, setFull] = useState(false);
  const mine = turn.role === "user";
  const injected: { tag: string; text: string }[] = [];
  const said: Shown[] = [];
  turn.parts.forEach((part, index) => {
    if (part.kind !== "text") {
      said.push({ key: `${index}`, kind: "tool", text: `${part.name}: ${part.summary}` });
      return;
    }
    splitInjected(part.text).forEach((piece, at) => {
      if (piece.kind === "injected") injected.push(piece);
      else said.push({ key: `${index}:${at}`, kind: "said", text: piece.text });
    });
  });
  const length = said.reduce((total, piece) => total + (piece.kind === "said" ? piece.text.length : 0), 0);
  const clipped = !full && length > LONG_TURN;
  const context = injected.length ? (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded: contextOpen }}
      onPress={() => setContextOpen((open) => !open)}
      style={{ minHeight: 44, justifyContent: "center", gap: 6 }}
    >
      <Text style={{ color: palette.muted, fontSize: 12 }}>
        {contextOpen ? "▾" : "▸"} Harness context · {injected.map((piece) => piece.tag.replaceAll("_", " ")).join(", ")}
      </Text>
      {contextOpen
        ? injected.map((piece, index) => (
            <Text key={index} style={{ color: palette.muted, fontSize: 12, lineHeight: 17, fontFamily: "monospace" }}>
              {piece.text}
            </Text>
          ))
        : null}
    </Pressable>
  ) : null;
  if (said.length === 0) return context ? <View style={{ alignSelf: "stretch", paddingHorizontal: 4 }}>{context}</View> : null;
  return (
    <View style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "92%", borderRadius: 14, backgroundColor: mine ? palette.message : palette.card, padding: 12, gap: 6 }}>
      <Text style={{ color: palette.muted, fontSize: 11 }}>{mine ? "You" : "Assistant"} · {clock(turn.at)}</Text>
      {context}
      <View style={{ gap: 6, maxHeight: clipped ? 320 : undefined, overflow: "hidden" }}>
        {said.map((piece) =>
          piece.kind === "said" ? (
            <RichText key={piece.key} text={piece.text} style={{ color: palette.foreground, fontSize: 15, lineHeight: 21 }} />
          ) : (
            <Text key={piece.key} style={{ color: palette.muted, fontSize: 13 }}>{piece.text}</Text>
          ),
        )}
      </View>
      {length > LONG_TURN ? (
        <Pressable accessibilityRole="button" onPress={() => setFull((open) => !open)} style={{ minHeight: 44, justifyContent: "center" }}>
          <Text style={{ color: palette.info }}>{full ? "Show less" : "Show all"}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const NO_SUMMARY: Record<SessionDetail["memoryState"], string> = {
  capturing: "Still capturing. The summary is written after the session goes quiet.",
  queued: "Queued for summarizing. Check back after the memory worker catches up.",
  flagged: "Summarizing this session was flagged, so there is no summary yet.",
  summarized: "The summary did not load.",
};

function Summary({ id, state, onLeaf }: { id: SessionId; state: SessionDetail["memoryState"]; onLeaf: (range: [number, number]) => void }) {
  const { palette } = useTheme();
  const tree = useSummaryTree(id);
  const root = tree.data;
  if (!root) return <Loading label={tree.isError ? NO_SUMMARY[state] : "Loading summary…"} />;
  return (
    <View style={{ gap: 12 }}>
      <View style={{ borderRadius: 14, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.card, padding: 14, gap: 8 }}>
        <KindTag label="Root" color={palette.primary} />
        <Text style={{ color: palette.foreground, fontWeight: "600" }}>{root.title ?? "Whole session"}</Text>
        <Text style={{ fontFamily: "serif", color: palette.foreground, fontSize: 16, lineHeight: 24 }}>{root.text}</Text>
      </View>
      {root.children.map((branch, index) => (
        <Branch key={`${branch.messageRange[0]}:${index}`} node={branch} onLeaf={onLeaf} />
      ))}
    </View>
  );
}

function Branch({ node, onLeaf }: { node: SummaryNode; onLeaf: (range: [number, number]) => void }) {
  const { palette } = useTheme();
  const [open, setOpen] = useState(true);
  return (
    <View style={{ borderLeftWidth: 2, borderLeftColor: palette.border, paddingLeft: 12, gap: 8 }}>
      <Pressable accessibilityRole="button" onPress={() => setOpen((current) => !current)} style={{ minHeight: 48, justifyContent: "center", gap: 4 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <KindTag label="Branch" color={palette.info} />
          <Text style={{ flex: 1, color: palette.foreground, fontWeight: "600" }}>{node.title ?? node.text}</Text>
          <Text style={{ color: palette.muted }}>{open ? "▾" : "▸"}</Text>
        </View>
        <Text style={{ color: palette.muted, fontSize: 13 }}>{node.text}</Text>
      </Pressable>
      {open
        ? node.children.map((leaf, index) => (
            <View key={`${leaf.messageRange[0]}:${index}`} style={{ gap: 4, paddingBottom: 8 }}>
              <Text style={{ color: palette.muted, fontSize: 11, fontWeight: "600" }}>LEAF · {leaf.messageRange[0]}–{leaf.messageRange[1]}</Text>
              <Text style={{ color: palette.foreground, lineHeight: 20 }}>{leaf.text}</Text>
              <Pressable accessibilityRole="button" onPress={() => onLeaf(leaf.messageRange)} style={{ minHeight: 44, justifyContent: "center" }}>
                <Text style={{ color: palette.info }}>View in transcript</Text>
              </Pressable>
            </View>
          ))
        : null}
    </View>
  );
}

function FileSheet({ session, current, onClose }: { session: SessionId; current: TopicId | null; onClose: () => void }) {
  const { palette } = useTheme();
  const topics = useTopicTree();
  const place = usePlaceSession();
  const choices = flattenTopics(topics.data ?? []);
  const file = (topic: TopicId | null) => {
    place.mutate(
      { session, topic },
      { onSuccess: onClose, onError: (error) => Alert.alert("Could not file", errorText(error)) },
    );
  };
  return (
    <Sheet title="File in a topic" onClose={onClose}>
      <ScrollView style={{ maxHeight: 320 }}>
        <Pressable accessibilityRole="button" onPress={() => file(null)} style={{ minHeight: 48, justifyContent: "center" }}>
          <Text style={{ color: current === null ? palette.primary : palette.foreground }}>Unfiled</Text>
        </Pressable>
        {choices.map((choice) => (
          <Pressable key={choice.id} accessibilityRole="button" onPress={() => file(choice.id)} style={{ minHeight: 48, justifyContent: "center" }}>
            <Text style={{ color: choice.id === current ? palette.primary : palette.foreground }}>{choice.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </Sheet>
  );
}

function ShareSheet({ session, space, onClose }: { session: SessionId; space: string; onClose: () => void }) {
  const setVisibility = useSetVisibility();
  const [name, setName] = useState(space);
  const { palette } = useTheme();
  const [error, setError] = useState<string | null>(null);
  const save = () => {
    const trimmed = name.trim();
    const visibility = trimmed ? { kind: "space" as const, space: trimmed } : { kind: "private" as const };
    setVisibility.mutate(
      { id: session, visibility },
      { onSuccess: onClose, onError: (caught) => setError(errorText(caught)) },
    );
  };
  return (
    <Sheet title="Share" onClose={onClose}>
      <TextField label="Space name" value={name} onChangeText={setName} placeholder="Leave empty to keep it private" />
      {error ? <Text style={{ color: palette.error }}>{error}</Text> : null}
      <PrimaryButton label={setVisibility.isPending ? "Saving…" : "Save"} onPress={save} disabled={setVisibility.isPending} />
      <GhostButton label="Cancel" onPress={onClose} />
    </Sheet>
  );
}

function flattenTopics(nodes: TopicNode[], prefix: string[] = []): { id: TopicId; label: string }[] {
  const rows: { id: TopicId; label: string }[] = [];
  for (const node of nodes) {
    const path = [...prefix, node.name];
    rows.push({ id: node.id, label: path.join(" › ") });
    rows.push(...flattenTopics(node.children, path));
  }
  return rows;
}
