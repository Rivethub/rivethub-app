import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { type ReactNode } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { useTopic } from "../data/queries";
import { useHub } from "../hub/HubContext";
import { isPinned } from "../hub/pins";
import { openSubject } from "../nav/go";
import type { RootParams } from "../nav/types";
import { useTheme } from "../theme/Theme";
import { BackButton, DataBanner, Loading, RichText, Screen } from "../ui/chrome";
import { shortDate, when } from "../ui/format";

type Props = NativeStackScreenProps<RootParams, "Topic">;

export function TopicScreen({ route, navigation }: Props) {
  const { palette } = useTheme();
  const topic = useTopic(route.params.id);
  const { pins, togglePin } = useHub();
  const article = topic.data;
  const pinned = article ? isPinned(pins, "topic", article.id) : false;

  return (
    <Screen>
      <View style={{ flexDirection: "row", alignItems: "center", paddingRight: 8 }}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={{ flex: 1, color: palette.muted, fontSize: 13 }}>{article?.status === "closed" ? "Closed topic" : "Topic"}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="More"
          disabled={!article}
          onPress={() => {
            if (!article) return;
            Alert.alert(article.name, undefined, [
              {
                text: pinned ? "Unpin" : "Pin",
                onPress: () => togglePin({ kind: "topic", id: article.id, title: article.name }),
              },
              { text: "Close", style: "cancel" },
            ]);
          }}
          style={{ minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" }}
        >
          <Text style={{ color: palette.foreground, fontSize: 18 }}>{pinned ? "★" : "⋯"}</Text>
        </Pressable>
      </View>
      <DataBanner reaching={topic.isFetching && !article} />
      {!article ? (
        <Loading label={topic.isError ? "This topic did not load." : "Loading topic…"} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 32 }}>
          <Text style={{ fontFamily: palette.reading, color: palette.foreground, fontSize: 28, fontWeight: "600" }}>{article.name}</Text>
          {article.path.length > 1 ? (
            <Text style={{ color: palette.muted, fontSize: 13 }}>{article.path.map((part) => part.name).join(" › ")}</Text>
          ) : null}
          {article.lead ? <RichText text={article.lead} style={{ fontFamily: palette.reading, color: palette.foreground, fontSize: 16, lineHeight: 24 }} /> : null}
          {article.current ? <RichText text={article.current} style={{ color: palette.foreground, fontSize: 15, lineHeight: 22 }} /> : null}
          <Section title="Decisions">
            {article.decisions.length === 0 ? <Muted>No decisions yet.</Muted> : article.decisions.map((decision) => (
              <View key={decision.id} style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: palette.border }}>
                <Text style={{ color: decision.superseded ? palette.muted : palette.foreground, textDecorationLine: decision.superseded ? "line-through" : "none" }}>{decision.text}</Text>
                <Text style={{ color: palette.muted, fontSize: 12 }}>{shortDate(decision.at)}</Text>
              </View>
            ))}
          </Section>
          <Section title="Sessions">
            {article.sessions.length === 0 ? <Muted>No sessions filed here.</Muted> : article.sessions.map((session) => (
              <Pressable
                key={session.id}
                accessibilityRole="button"
                onPress={() => openSubject({ kind: "session", id: session.id, title: session.title })}
                style={{ minHeight: 56, justifyContent: "center", borderBottomWidth: 1, borderBottomColor: palette.border }}
              >
                <Text style={{ color: palette.muted, fontSize: 12 }}>{session.harness} · {when(session.startedAt)}</Text>
                <Text style={{ color: palette.foreground }}>{session.title}</Text>
              </Pressable>
            ))}
          </Section>
          {article.subtopics.length > 0 ? (
            <Section title="Subtopics">
              {article.subtopics.map((sub) => (
                <Pressable
                  key={sub.id}
                  accessibilityRole="button"
                  onPress={() => navigation.push("Topic", { id: sub.id })}
                  style={{ minHeight: 48, justifyContent: "center" }}
                >
                  <Text style={{ color: palette.foreground }}>{sub.name}</Text>
                </Pressable>
              ))}
            </Section>
          ) : null}
        </ScrollView>
      )}
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const { palette } = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: palette.muted, fontSize: 12, fontWeight: "600" }}>{title.toUpperCase()}</Text>
      {children}
    </View>
  );
}

function Muted({ children }: { children: string }) {
  const { palette } = useTheme();
  return <Text style={{ color: palette.muted }}>{children}</Text>;
}
