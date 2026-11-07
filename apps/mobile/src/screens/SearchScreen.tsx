import type { SubjectRef } from "@rivethub/contracts";
import { useEffect, useState, type ReactNode } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSearch } from "../data/queries";
import { openReview, openSubject } from "../nav/go";
import { navigationRef } from "../nav/ref";
import { useTheme } from "../theme/Theme";
import { DataBanner, Screen } from "../ui/chrome";

const KIND_LABEL: Record<SubjectRef["kind"], string> = { topic: "Topic", entity: "Entity", session: "Session" };

export function SearchScreen() {
  const { palette } = useTheme();
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setQuery(text.trim()), 200);
    return () => clearTimeout(timer);
  }, [text]);

  const search = useSearch(query);
  const results = query ? search.data : undefined;

  return (
    <Screen>
      <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8 }}>
        <Text style={{ color: palette.foreground, fontSize: 22, fontWeight: "600", marginBottom: 12 }}>Search</Text>
        <TextInput
          accessibilityLabel="Search memory"
          value={text}
          onChangeText={setText}
          placeholder="Topics, entities, sessions"
          placeholderTextColor={palette.muted}
          autoCapitalize="none"
          autoCorrect={false}
          style={{
            minHeight: 48,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: palette.border,
            backgroundColor: palette.card,
            color: palette.foreground,
            paddingHorizontal: 14,
            fontSize: 16,
          }}
        />
      </View>
      <DataBanner reaching={search.isFetching && !search.data} />
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        {results ? (
          <>
            <Group label="GO TO">
              {results.goTo.length === 0 ? <Empty /> : results.goTo.map((hit) => (
                <Pressable
                  key={`${hit.subject.kind}:${hit.subject.id}`}
                  accessibilityRole="button"
                  onPress={() => openSubject(hit.subject)}
                  style={rowStyle(palette.border)}
                >
                  <Text style={{ color: palette.muted, fontSize: 12 }}>{KIND_LABEL[hit.subject.kind]}</Text>
                  <Text style={{ color: palette.foreground, fontSize: 16 }}>{hit.subject.title}</Text>
                  {hit.snippet ? <Text style={{ color: palette.muted, fontSize: 13, lineHeight: 18 }} numberOfLines={3}>{hit.snippet}</Text> : null}
                </Pressable>
              ))}
            </Group>
            {results.actions.length > 0 ? (
            <Group label="DO">
              {results.actions.map((action) => (
                <Pressable key={action.id} accessibilityRole="button" onPress={() => runAction(action.id)} style={rowStyle(palette.border)}>
                  <Text style={{ color: palette.foreground, fontSize: 16 }}>{action.label}</Text>
                  {action.hint ? <Text style={{ color: palette.muted, fontSize: 13 }}>{action.hint}</Text> : null}
                </Pressable>
              ))}
            </Group>
            ) : null}
          </>
        ) : (
          <Text style={{ color: palette.muted, paddingHorizontal: 16, paddingTop: 8 }}>Type to search this hub.</Text>
        )}
      </ScrollView>
    </Screen>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  const { palette } = useTheme();
  return (
    <View style={{ marginTop: 8 }}>
      <Text style={{ paddingHorizontal: 16, paddingVertical: 8, color: palette.muted, fontSize: 12, fontWeight: "600" }}>{label}</Text>
      {children}
    </View>
  );
}

function Empty() {
  const { palette } = useTheme();
  return <Text style={{ color: palette.muted, paddingHorizontal: 16, paddingBottom: 8 }}>Nothing here.</Text>;
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
  else if (id === "new-topic") Alert.alert("New topic", "Creating a topic is not on the phone yet.");
  else Alert.alert("Not on the phone", "That action is not on the phone yet.");
}
