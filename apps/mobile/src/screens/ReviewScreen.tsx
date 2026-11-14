import type { ReviewDecision, ReviewItem } from "@rivethub/contracts";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Animated, PanResponder, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useDecide, useReviewQueue } from "../data/queries";
import { markStep } from "../lib/journeyStore";
import { openSubject } from "../nav/go";
import { acceptDecision, decisionForSwipe, reviewDecisionFor } from "../review/decision";
import { alpha } from "../theme/tokens";
import { useTheme } from "../theme/Theme";
import { DataBanner, GhostButton, HubChip, KindTag, PrimaryButton, RichText, Screen } from "../ui/chrome";
import { count, errorText, groupColor, groupLabel, shortDate } from "../ui/format";

const FILTERS: { id: ReviewItem["group"] | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "conflict", label: "Conflicts" },
  { id: "fact", label: "Facts" },
  { id: "filing", label: "Filing" },
  { id: "new-entity", label: "New" },
  { id: "tag", label: "Tags" },
  { id: "tidy", label: "Tidy" },
];

export function ReviewScreen() {
  const { palette } = useTheme();
  const review = useReviewQueue();
  const decide = useDecide();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [choice, setChoice] = useState("");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [evidenceOpen, setEvidenceOpen] = useState(true);
  const queue = review.data ?? [];
  const filtered = queue.filter((item) => !skipped.has(item.id) && (filter === "all" || item.group === filter));
  const item = filtered[0];
  const done = queue.filter((entry) => skipped.has(entry.id) && (filter === "all" || entry.group === filter)).length;
  const total = done + filtered.length;
  const pan = useRef(new Animated.Value(0)).current;
  const itemRef = useRef(item);
  const choiceRef = useRef(choice);
  const editingRef = useRef(editing);
  const draftRef = useRef(draft);
  itemRef.current = item;
  choiceRef.current = choice;
  editingRef.current = editing;
  draftRef.current = draft;

  useEffect(() => {
    setChoice(item?.options?.[0]?.value ?? "");
    setEditing(false);
    setDraft(item?.after ?? item?.text ?? "");
    setEvidenceOpen(true);
    pan.setValue(0);
  }, [item?.id, pan]);

  const commit = (decision: ReviewDecision) => {
    const current = itemRef.current;
    if (!current) return;
    setSkipped((prev) => new Set(prev).add(current.id));
    if (decision.kind !== "later") markStep("review");
    decide.mutate(
      { id: current.id, decision },
      {
        onError: (error) => {
          setSkipped((prev) => {
            const next = new Set(prev);
            next.delete(current.id);
            return next;
          });
          Alert.alert("Not saved", errorText(error));
        },
      },
    );
  };
  const commitRef = useRef(commit);
  commitRef.current = commit;

  const responder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 12 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
        onPanResponderMove: (_, gesture) => pan.setValue(gesture.dx),
        onPanResponderRelease: (_, gesture) => {
          const outcome = decisionForSwipe(gesture.dx);
          const current = itemRef.current;
          if (!outcome || !current) {
            Animated.spring(pan, { toValue: 0, useNativeDriver: true }).start();
            return;
          }
          const decision = outcome === "skip" ? reviewDecisionFor("skip") : acceptDecision(current, choiceRef.current, editingRef.current, draftRef.current);
          Animated.timing(pan, { toValue: outcome === "accept" ? 420 : -420, duration: 160, useNativeDriver: true }).start(() => {
            commitRef.current(decision);
            pan.setValue(0);
          });
        },
        onPanResponderTerminate: () => Animated.spring(pan, { toValue: 0, useNativeDriver: true }).start(),
      }),
    [pan],
  );

  const rotate = pan.interpolate({ inputRange: [-180, 0, 180], outputRange: ["-6deg", "0deg", "6deg"], extrapolate: "clamp" });
  const counts = countGroups(queue.filter((entry) => !skipped.has(entry.id)));

  return (
    <Screen>
      <View style={{ flex: 1 }}>
        <View style={{ gap: 10, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Text style={{ color: palette.foreground, fontSize: 22, fontWeight: "600" }}>Review</Text>
            <Text style={{ flex: 1, color: palette.muted, fontSize: 13 }}>{item ? `${done + 1} of ${total}` : "Caught up"}</Text>
            <HubChip />
          </View>
          <View style={{ height: 4, borderRadius: 2, backgroundColor: palette.card }}>
            <View style={{ width: total ? `${Math.min(100, (done / total) * 100)}%` : "0%", height: 4, borderRadius: 2, backgroundColor: palette.primary }} />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {FILTERS.map((entry) => {
              const count = entry.id === "all" ? queue.filter((row) => !skipped.has(row.id)).length : (counts[entry.id] ?? 0);
              const selected = filter === entry.id;
              return (
                <Pressable
                  key={entry.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => setFilter(entry.id)}
                  style={{ minHeight: 44, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: palette.border, backgroundColor: selected ? palette.selected : "transparent", justifyContent: "center" }}
                >
                  <Text style={{ color: palette.foreground, fontSize: 13 }}>{entry.label} {count}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
        <DataBanner reaching={review.isPlaceholderData && review.isFetching} />
        <View style={{ flex: 1, paddingHorizontal: 16 }}>
          {item ? (
            <>
              <View pointerEvents="none" style={{ position: "absolute", left: 28, right: 28, top: 18, height: 280, borderRadius: 18, backgroundColor: palette.card, opacity: 0.45 }} />
              <Animated.View {...responder.panHandlers} style={{ transform: [{ translateX: pan }, { rotate }] }}>
                <ReviewCard item={item} choice={choice} onChoice={setChoice} editing={editing} draft={draft} onDraft={setDraft} evidenceOpen={evidenceOpen} onToggleEvidence={() => setEvidenceOpen((open) => !open)} />
              </Animated.View>
              <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 12 }}>
                <Text style={{ color: palette.error, fontSize: 13 }}>← Swipe to skip</Text>
                <Text style={{ color: palette.success, fontSize: 13 }}>Swipe to accept →</Text>
              </View>
            </>
          ) : (
            <View style={{ paddingTop: 48, gap: 8 }}>
              <Text style={{ fontFamily: palette.reading, color: palette.foreground, fontSize: 26, fontWeight: "600" }}>You're caught up</Text>
              <Text style={{ color: palette.muted, fontSize: 15, lineHeight: 22 }}>Nothing in this pile is waiting on you.</Text>
            </View>
          )}
        </View>
        {item ? (
          <View style={{ flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingBottom: 10 }}>
            <View style={{ flex: 1 }}>
              <GhostButton label="Later" onPress={() => commit({ kind: "later" })} />
            </View>
            <View style={{ flex: 1 }}>
              <GhostButton label={editing ? "Cancel" : "Edit"} onPress={() => setEditing((value) => !value)} />
            </View>
            <View style={{ flex: 1.4 }}>
              <PrimaryButton
                label={editing ? "Save" : item.options?.[0] ? `Take ${(choice || item.options[0].value).split(" ")[0]}` : "Accept"}
                onPress={() => commit(acceptDecision(item, choice, editing, draft))}
              />
            </View>
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

function ReviewCard({
  item,
  choice,
  onChoice,
  editing,
  draft,
  onDraft,
  evidenceOpen,
  onToggleEvidence,
}: {
  item: ReviewItem;
  choice: string;
  onChoice: (value: string) => void;
  editing: boolean;
  draft: string;
  onDraft: (value: string) => void;
  evidenceOpen: boolean;
  onToggleEvidence: () => void;
}) {
  const { palette } = useTheme();
  const color = groupColor(item.group, palette);
  return (
    <View accessibilityHint="Swipe right to accept, left to skip" style={{ gap: 12, padding: 18, borderRadius: 18, backgroundColor: palette.card, borderWidth: 1, borderColor: item.group === "conflict" ? alpha(color, 0.5) : palette.border }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <KindTag label={groupLabel(item.group)} color={color} />
        <Pressable accessibilityRole="link" onPress={() => openSubject(item.subject)} style={{ minHeight: 44, justifyContent: "center" }}>
          <Text style={{ color: palette.info, fontWeight: "600" }}>{item.subject.title}</Text>
        </Pressable>
      </View>
      <RichText text={item.text} style={{ color: palette.foreground, fontSize: 18, fontWeight: "600", lineHeight: 24 }} />
      {item.before || item.after ? (
        <Text style={{ color: palette.muted, fontSize: 14 }}>{[item.before, item.after].filter(Boolean).join(" → ")}</Text>
      ) : null}
      {editing ? (
        <TextInput value={draft} onChangeText={onDraft} multiline style={{ minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: palette.input, color: palette.foreground, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 }} />
      ) : null}
      {item.options?.map((option) => {
        const selected = (choice || item.options?.[0]?.value) === option.value;
        return (
          <Pressable key={option.value} accessibilityRole="radio" accessibilityState={{ selected }} onPress={() => onChoice(option.value)} style={{ minHeight: 48, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, borderRadius: 12, borderWidth: selected ? 2 : 1, borderColor: selected ? palette.primary : palette.border, backgroundColor: selected ? alpha(palette.primary, 0.1) : "transparent" }}>
            <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: selected ? palette.primary : palette.muted, alignItems: "center", justifyContent: "center" }}>
              {selected ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: palette.primary }} /> : null}
            </View>
            <Text style={{ flex: 1, color: palette.foreground, fontWeight: "600" }}>{option.label}</Text>
            {option.source ? <Text style={{ color: palette.muted, fontSize: 12 }}>{shortDate(option.source.at)}</Text> : null}
          </Pressable>
        );
      })}
      <Pressable accessibilityRole="button" onPress={onToggleEvidence} style={{ minHeight: 44, justifyContent: "center", borderTopWidth: 1, borderTopColor: palette.border }}>
        <Text style={{ color: palette.muted, fontSize: 14 }}>{evidenceOpen ? "▾" : "▸"} Why? {count(item.evidence.length, "session")}</Text>
      </Pressable>
      {evidenceOpen
        ? item.evidence.map((quote, index) => (
            <View key={`${quote.session.id}-${index}`} style={{ gap: 6 }}>
              <RichText text={quote.quote} style={{ color: palette.foreground, fontSize: 14, lineHeight: 21, borderLeftWidth: 3, borderLeftColor: palette.success, backgroundColor: palette.background, borderRadius: 6, paddingVertical: 10, paddingHorizontal: 12 }} />
              <Pressable accessibilityRole="link" onPress={() => openSubject({ kind: "session", id: quote.session.id, title: quote.session.title })} style={{ minHeight: 44, justifyContent: "center" }}>
                <Text style={{ color: palette.info, fontSize: 13 }}>{quote.session.title} · {shortDate(quote.at)}</Text>
              </Pressable>
            </View>
          ))
        : null}
    </View>
  );
}

function countGroups(items: ReviewItem[]): Partial<Record<ReviewItem["group"], number>> {
  const counts: Partial<Record<ReviewItem["group"], number>> = {};
  for (const item of items) counts[item.group] = (counts[item.group] ?? 0) + 1;
  return counts;
}
