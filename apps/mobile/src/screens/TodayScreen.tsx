import { harnessNames } from "@rivethub/client-runtime/format";
import type { ReviewItem } from "@rivethub/contracts";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { useDecide, useHarnesses, useModelJobs, useReviewQueue, useToday } from "../data/queries";
import { markStep, setGuideHidden, useJourney } from "../lib/journeyStore";
import { visibleTodayEntries } from "../lib/sessions";
import { openGuide, openReview, openStep, openSubject } from "../nav/go";
import { navigationRef } from "../nav/ref";
import { alpha } from "../theme/tokens";
import { useTheme } from "../theme/Theme";
import { DataBanner, HubChip, KindTag, Screen } from "../ui/chrome";
import { changeColor, changeLabel, clock, errorText, groupColor, groupLabel, longDate } from "../ui/format";
import { Progress } from "./GuideScreen";

export function TodayScreen() {
  const { palette } = useTheme();
  const today = useToday();
  const digest = today.data;
  const entries = digest ? visibleTodayEntries(digest.entries) : [];
  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8 }}>
          <Text style={{ flex: 1, color: palette.muted, fontSize: 13 }}>{digest ? longDate(digest.date) : ""}</Text>
          <HubChip />
        </View>
        <DataBanner reaching={today.isPlaceholderData && today.isFetching} />
        {digest ? (
          <View style={{ paddingHorizontal: 16, gap: 18 }}>
            <View style={{ gap: 8 }}>
              <Text style={{ fontFamily: palette.reading, color: palette.foreground, fontSize: 27, fontWeight: "600", lineHeight: 34 }}>{digest.headline}</Text>
              <Text style={{ fontFamily: palette.reading, color: palette.foreground, fontSize: 16, lineHeight: 25 }}>{digest.summary}</Text>
            </View>
            <Health />
            {digest.needsYou.length > 0 ? (
              <View style={{ gap: 8 }}>
                <View style={{ flexDirection: "row", alignItems: "baseline" }}>
                  <Text style={{ flex: 1, color: palette.foreground, fontWeight: "600" }}>Needs you</Text>
                  <Pressable accessibilityRole="link" onPress={openReview} style={{ minHeight: 44, justifyContent: "center" }}>
                    <Text style={{ color: palette.info, fontSize: 14 }}>All {digest.reviewCount}</Text>
                  </Pressable>
                </View>
                <NeedsRow items={digest.needsYou} />
              </View>
            ) : null}
            <NextStep />
            <View style={{ gap: 12 }}>
              <Text style={{ color: palette.foreground, fontWeight: "600" }}>What changed</Text>
              {entries.length === 0 ? <Text style={{ color: palette.muted }}>Nothing was captured this day. Sessions appear here as your connected tools finish them.</Text> : null}
              {entries.map((entry) => (
                <Pressable key={entry.session.id} accessibilityRole="button" onPress={() => openSubject({ kind: "session", id: entry.session.id, title: entry.session.title })} style={{ gap: 6, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: palette.border }}>
                  <Text style={{ color: palette.muted, fontSize: 12 }}>
                    {clock(entry.session.startedAt)} · {harnessNames[entry.session.harness] ?? entry.session.harness}
                    {entry.session.topic ? ` · ${entry.session.topic.path.slice(-2).join(" › ")}` : ""}
                  </Text>
                  <Text style={{ color: palette.foreground, fontWeight: "600", fontSize: 15 }}>{entry.session.title}</Text>
                  {entry.changes.map((change, index) => (
                    <View key={`${change.at}-${index}`} style={{ flexDirection: "row", gap: 8 }}>
                      <Text style={{ width: 58, color: changeColor(change.kind, palette), fontSize: 11, fontWeight: "600", paddingTop: 2 }}>{changeLabel(change.kind)}</Text>
                      <Text style={{ flex: 1, color: palette.foreground, fontSize: 14, lineHeight: 20 }}>{change.text}</Text>
                    </View>
                  ))}
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function Health() {
  const { palette } = useTheme();
  const harnesses = useHarnesses().data;
  const jobs = useModelJobs().data;
  if (!harnesses) return null;
  const stale = harnesses.filter((harness) => harness.capture.state === "stale");
  // A tool that is set up and has sent nothing yet is not sending, and has not stopped either.
  const none = !harnesses.some((harness) => harness.capture.state === "receiving" || harness.capture.state === "stale");
  const failing = (jobs ?? []).filter((job) => job.health === "failing");
  const problems = [
    none ? "No tool is sending sessions yet" : "",
    stale.length ? `${stale.map((harness) => harness.name).join(" and ")} stopped sending sessions` : "",
    failing.length ? `the ${failing.map((job) => job.role).join(" and ")} ${failing.length === 1 ? "model is" : "models are"} failing` : "",
  ].filter(Boolean);
  if (!problems.length) return null;
  const text = problems.join(", and ");
  const sentence = `${text[0]!.toUpperCase()}${text.slice(1)}.`;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderColor: alpha(palette.warning, 0.5), backgroundColor: palette.card, borderRadius: 12, padding: 12 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: palette.warning }} />
      <Text style={{ flex: 1, color: palette.foreground, fontSize: 14, lineHeight: 20 }}>{sentence}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          if (navigationRef.isReady()) navigationRef.navigate("Settings", { section: "connections" });
        }}
        style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 4 }}
      >
        <Text style={{ color: palette.info, fontWeight: "600" }}>Fix</Text>
      </Pressable>
    </View>
  );
}

function NeedsRow({ items }: { items: ReviewItem[] }) {
  const queue = useReviewQueue().data ?? [];
  const filing = queue.filter((item) => item.group === "filing");
  const collapse = filing.length > 1;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
      {items.map((item, index) => {
        if (item.group !== "filing" || !collapse) return <NeedCard key={item.id} item={item} />;
        const first = items.findIndex((other) => other.group === "filing");
        return first === index ? <FilingCard key="filing" items={filing} /> : null;
      })}
    </ScrollView>
  );
}

function NeedCard({ item }: { item: ReviewItem }) {
  const { palette } = useTheme();
  const color = groupColor(item.group, palette);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={openReview}
      style={{
        width: 250,
        gap: 8,
        padding: 14,
        borderRadius: 14,
        backgroundColor: palette.card,
        borderWidth: 1,
        borderColor: item.group === "conflict" ? alpha(palette.warning, 0.45) : palette.border,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <KindTag label={groupLabel(item.group)} color={color} />
        <Text style={{ flexShrink: 1, color: palette.foreground, fontWeight: "600", fontSize: 14 }} numberOfLines={2}>{item.subject.title}</Text>
      </View>
      <Text style={{ color: palette.foreground, fontSize: 14, lineHeight: 20 }}>{item.text}</Text>
    </Pressable>
  );
}

function FilingCard({ items }: { items: ReviewItem[] }) {
  const { palette } = useTheme();
  const decide = useDecide();
  const fileAll = () => {
    markStep("review");
    for (const item of items) {
      decide.mutate({ id: item.id, decision: { kind: "accept" } }, { onError: (error) => Alert.alert("Could not file", errorText(error)) });
    }
  };
  const later = () => {
    for (const item of items) decide.mutate({ id: item.id, decision: { kind: "later" } });
  };
  return (
    <View style={{ width: 250, gap: 8, padding: 14, borderRadius: 14, backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <KindTag label="Filing" color={palette.info} />
        <Text style={{ color: palette.foreground, fontWeight: "600", fontSize: 14 }}>{items.length} {items.length === 1 ? "session" : "sessions"}</Text>
      </View>
      <Text style={{ color: palette.foreground, fontSize: 14, lineHeight: 20 }}>Unfiled sessions with suggested topics.</Text>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Pressable accessibilityRole="button" disabled={decide.isPending} onPress={fileAll} style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 12, borderRadius: 10, backgroundColor: palette.primary, opacity: decide.isPending ? 0.55 : 1 }}>
          <Text style={{ color: palette.primaryForeground, fontWeight: "600" }}>File all</Text>
        </Pressable>
        <Pressable accessibilityRole="button" disabled={decide.isPending} onPress={later} style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 12 }}>
          <Text style={{ color: palette.foreground }}>Later</Text>
        </Pressable>
      </View>
    </View>
  );
}

function NextStep() {
  const { palette } = useTheme();
  const journey = useJourney();
  if (!journey.ready || journey.finished || journey.hidden || !journey.next) return null;
  const next = journey.next;
  return (
    <View style={{ gap: 8, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.card, borderRadius: 12, padding: 14 }}>
      <Text style={{ color: palette.primary, fontSize: 12, fontWeight: "600" }}>
        Next step · {journey.stage.title} <Text style={{ color: palette.muted, fontWeight: "400" }}>· {journey.doneCount} of {journey.steps.length} done</Text>
      </Text>
      <Text style={{ color: palette.foreground, fontSize: 15, fontWeight: "600" }}>{next.title}</Text>
      <Text style={{ color: palette.muted, fontSize: 13, lineHeight: 18 }}>{next.why}</Text>
      <Progress done={journey.doneCount} total={journey.steps.length} />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Pressable accessibilityRole="button" onPress={() => openStep(next.action.to)} style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 14, borderRadius: 10, backgroundColor: palette.primary }}>
          <Text style={{ color: palette.primaryForeground, fontWeight: "600" }}>{next.action.label}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={openGuide} style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 8 }}>
          <Text style={{ color: palette.info }}>All steps</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Hide the guide on Today" onPress={() => setGuideHidden(true)} style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 8 }}>
          <Text style={{ color: palette.muted }}>Hide</Text>
        </Pressable>
      </View>
    </View>
  );
}
