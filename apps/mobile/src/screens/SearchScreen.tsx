import { shortDate, time } from "@rivethub/client-runtime/format";
import type { SearchMode, SearchOptions, SearchPassage, SearchScope, SearchWindow, SubjectRef } from "@rivethub/contracts";
import { useEffect, useState, type ReactNode } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSearch } from "../data/queries";
import { markStep } from "../lib/journeyStore";
import { openReview, openSubject } from "../nav/go";
import { navigationRef } from "../nav/ref";
import { useTheme } from "../theme/Theme";
import { DataBanner, RichText, Screen } from "../ui/chrome";

const WINDOWS: { id: SearchWindow | ""; label: string }[] = [
  { id: "", label: "Any time" },
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "last_7d", label: "Last 7 days" },
  { id: "last_14d", label: "Last 14 days" },
];
const SCOPES: { id: SearchScope | ""; label: string }[] = [
  { id: "", label: "Messages and summaries" },
  { id: "messages", label: "Messages only" },
  { id: "summaries", label: "Summaries only" },
];
const MODES: { id: SearchMode; label: string; hint: string }[] = [
  { id: "best", label: "Best match", hint: "Blends every method below." },
  { id: "words", label: "Exact words", hint: "The words as typed." },
  { id: "fuzzy", label: "Similar spelling", hint: "Forgives typos and partial names." },
  { id: "meaning", label: "Meaning", hint: "Finds the idea in other words. Needs an embedding model." },
  { id: "pattern", label: "Pattern", hint: "A regular expression." },
];

const KIND_LABEL: Record<SubjectRef["kind"], string> = { topic: "Topic", entity: "Entity", session: "Session" };
const roleLabel: Record<NonNullable<SearchPassage["role"]>, string> = { user: "You", assistant: "Agent", tool: "Tool", system: "System" };

export function SearchScreen() {
  const { palette } = useTheme();
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const [when, setWhen] = useState<SearchWindow | "">("");
  const [where, setWhere] = useState<SearchScope | "">("");
  const [match, setMatch] = useState<SearchMode>("best");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setQuery(text.trim()), 200);
    return () => clearTimeout(timer);
  }, [text]);

  const options: SearchOptions = {
    ...(when ? { window: when } : {}),
    ...(where ? { scope: where } : {}),
    ...(match !== "best" ? { mode: match } : {}),
  };
  const advanced = (where ? 1 : 0) + (match !== "best" ? 1 : 0);
  const filterCount = Object.keys(options).length;
  const search = useSearch(query, options);
  const results = query ? search.data : undefined;
  const passages = results?.passages ?? [];

  useEffect(() => {
    if (query && results) markStep("search");
  }, [query, results]);

  return (
    <Screen>
      <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8, gap: 10 }}>
        <Text style={{ color: palette.foreground, fontSize: 22, fontWeight: "600" }}>Search</Text>
        <TextInput
          accessibilityLabel="Search memory"
          value={text}
          onChangeText={setText}
          placeholder="Search every session, topic and entity"
          placeholderTextColor={palette.muted}
          autoCapitalize="none"
          autoCorrect={false}
          style={{ minHeight: 48, borderRadius: 14, borderWidth: 2, borderColor: palette.primary, backgroundColor: palette.card, color: palette.foreground, paddingHorizontal: 14, fontSize: 16 }}
        />
      </View>
      <DataBanner reaching={search.isFetching && !search.data && query.length > 0} />
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingHorizontal: 16, paddingBottom: 8 }}>
          {WINDOWS.map((item) => (
            <Chip key={item.id || "any"} label={item.label} selected={when === item.id} onPress={() => setWhen(item.id)} />
          ))}
        </ScrollView>
        <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, gap: 8, paddingBottom: 8 }}>
          <Chip label={advanced ? `More filters · ${advanced}` : "More filters"} selected={open} onPress={() => setOpen((current) => !current)} />
          {filterCount > 0 ? (
            <Pressable accessibilityRole="button" onPress={() => { setWhen(""); setWhere(""); setMatch("best"); }} style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 8 }}>
              <Text style={{ color: palette.info }}>Clear</Text>
            </Pressable>
          ) : null}
        </View>
        {open ? (
          <View style={{ marginHorizontal: 16, marginBottom: 12, gap: 10, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.card, borderRadius: 12, padding: 12 }}>
            <Text style={{ color: palette.muted, fontSize: 12 }}>Look in</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {SCOPES.map((item) => (
                <Chip key={item.id || "both"} label={item.label} selected={where === item.id} onPress={() => setWhere(item.id)} />
              ))}
            </View>
            <Text style={{ color: palette.muted, fontSize: 12 }}>Match by</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {MODES.map((item) => (
                <Chip key={item.id} label={item.label} selected={match === item.id} onPress={() => setMatch(item.id)} />
              ))}
            </View>
            <Text style={{ color: palette.muted, fontSize: 12 }}>{MODES.find((item) => item.id === match)?.hint}</Text>
          </View>
        ) : null}
        {!query ? (
          <Text style={{ color: palette.muted, paddingHorizontal: 16, paddingTop: 8 }}>Type to search this hub.</Text>
        ) : (
          <>
            {results?.degraded ? (
              <Text accessibilityRole="text" style={{ marginHorizontal: 16, marginBottom: 8, borderWidth: 1, borderColor: palette.border, borderRadius: 10, padding: 10, color: palette.muted, fontSize: 13 }}>
                {results.degraded}
              </Text>
            ) : null}
            <Group label="Go to">
              {!results ? (
                <Muted>Searching…</Muted>
              ) : results.goTo.length === 0 ? (
                <Muted>Nothing to open by that name.</Muted>
              ) : (
                results.goTo.map((hit) => (
                  <Pressable key={`${hit.subject.kind}:${hit.subject.id}`} accessibilityRole="button" onPress={() => openSubject(hit.subject)} style={rowStyle(palette.border)}>
                    <Text style={{ color: palette.muted, fontSize: 12 }}>{KIND_LABEL[hit.subject.kind]}</Text>
                    <Text style={{ color: palette.foreground, fontSize: 16 }}>{hit.subject.title}</Text>
                    {hit.snippet ? <RichText text={hit.snippet} numberOfLines={3} style={{ color: palette.muted, fontSize: 13, lineHeight: 18 }} /> : null}
                  </Pressable>
                ))
              )}
            </Group>
            {results && results.actions.length > 0 ? (
              <Group label="Do">
                {results.actions.map((action) => (
                  <Pressable key={action.id} accessibilityRole="button" onPress={() => runAction(action.id)} style={rowStyle(palette.border)}>
                    <Text style={{ color: palette.foreground, fontSize: 16 }}>{action.label}</Text>
                    {action.hint ? <Text style={{ color: palette.muted, fontSize: 13 }}>{action.hint}</Text> : null}
                  </Pressable>
                ))}
              </Group>
            ) : null}
            <Group label={results ? `In sessions · ${passages.length} ${passages.length === 1 ? "match" : "matches"}` : "In sessions"}>
              {search.isPending ? (
                <Muted>Searching…</Muted>
              ) : search.isError ? (
                <Pressable accessibilityRole="button" onPress={() => void search.refetch()} style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 16 }}>
                  <Text style={{ color: palette.error }}>The search did not finish. <Text style={{ color: palette.info }}>Try again</Text></Text>
                </Pressable>
              ) : passages.length === 0 ? (
                <Muted>{`Nothing in any session matches${filterCount ? " with these filters" : ""}.`}</Muted>
              ) : (
                passages.map((passage) => (
                  <Pressable
                    key={passage.id}
                    accessibilityRole="button"
                    onPress={() => openSubject({ kind: "session", id: passage.session.id, title: passage.session.title })}
                    style={{ marginHorizontal: 16, marginBottom: 8, gap: 6, borderRadius: 12, backgroundColor: palette.card, padding: 14 }}
                  >
                    <Text style={{ color: palette.muted, fontSize: 12 }}>
                      {passage.source === "summary" ? "Summary" : passage.role ? roleLabel[passage.role] : "Message"}
                      {" · "}
                      <Text style={{ color: palette.foreground, fontWeight: "600" }}>{passage.session.title}</Text>
                      {passage.at ? ` · ${shortDate(passage.at)}, ${time(passage.at)}` : ""}
                    </Text>
                    <Highlight text={passage.text} query={match === "pattern" ? "" : query} />
                  </Pressable>
                ))
              )}
            </Group>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

function Highlight({ text, query }: { text: string; query: string }) {
  const { palette } = useTheme();
  const words = query.split(/\s+/).filter((word) => word.length > 1).map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!words.length || /\[[^\]]+\]\([^)]+\)|\*\*|`/.test(text)) return <RichText text={text} style={{ color: palette.muted, fontSize: 14, lineHeight: 20 }} />;
  const parts = text.split(new RegExp(`(${words.join("|")})`, "gi"));
  return (
    <Text style={{ color: palette.muted, fontSize: 14, lineHeight: 20 }}>
      {parts.map((part, index) => (index % 2 ? <Text key={index} style={{ color: palette.warning, fontWeight: "600" }}>{part}</Text> : part))}
    </Text>
  );
}

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const { palette } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={{ minHeight: 44, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: selected ? "transparent" : palette.border, backgroundColor: selected ? palette.selected : "transparent", justifyContent: "center" }}>
      <Text style={{ color: palette.foreground, fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  const { palette } = useTheme();
  return (
    <View style={{ marginTop: 8 }}>
      <Text style={{ paddingHorizontal: 16, paddingVertical: 8, color: palette.muted, fontSize: 12, fontWeight: "600" }}>{label.toUpperCase()}</Text>
      {children}
    </View>
  );
}

function Muted({ children }: { children: string }) {
  const { palette } = useTheme();
  return <Text style={{ color: palette.muted, paddingHorizontal: 16, paddingBottom: 8 }}>{children}</Text>;
}

function rowStyle(border: string) {
  return { minHeight: 56, justifyContent: "center" as const, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: border, gap: 2 };
}

function runAction(id: string): void {
  if (id === "open-review") {
    openReview();
    return;
  }
  if (!navigationRef.isReady()) return;
  if (id === "connect-harness") navigationRef.navigate("Settings", { section: "connections" });
  else if (id === "check-updates") navigationRef.navigate("Settings", { section: "account" });
  else if (id === "new-topic") navigationRef.navigate("Tabs", { screen: "Library", params: { segment: "topics" } });
}
