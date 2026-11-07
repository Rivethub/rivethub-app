import { Pressable, ScrollView, Text, View } from "react-native";
import { useToday } from "../data/queries";
import { openReview, openSubject } from "../nav/go";
import { alpha } from "../theme/tokens";
import { useTheme } from "../theme/Theme";
import { DataBanner, HubChip, KindTag, Screen } from "../ui/chrome";
import { changeColor, changeLabel, clock, groupColor, groupLabel, longDate } from "../ui/format";

export function TodayScreen() {
  const { palette } = useTheme();
  const today = useToday();
  const digest = today.data;
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
              <Text style={{ fontFamily: "serif", color: palette.foreground, fontSize: 27, fontWeight: "600", lineHeight: 34 }}>{digest.headline}</Text>
              <Text style={{ fontFamily: "serif", color: palette.foreground, fontSize: 16, lineHeight: 25 }}>{digest.summary}</Text>
            </View>
            <View style={{ gap: 8 }}>
              <View style={{ flexDirection: "row", alignItems: "baseline" }}>
                <Text style={{ flex: 1, color: palette.foreground, fontWeight: "600" }}>Needs you</Text>
                <Pressable accessibilityRole="link" onPress={openReview} style={{ minHeight: 44, justifyContent: "center" }}>
                  <Text style={{ color: palette.info, fontSize: 14 }}>All {digest.reviewCount}</Text>
                </Pressable>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                {digest.needsYou.map((item) => {
                  const color = groupColor(item.group, palette);
                  return (
                    <Pressable
                      key={item.id}
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
                })}
              </ScrollView>
            </View>
            <View style={{ gap: 12 }}>
              <Text style={{ color: palette.foreground, fontWeight: "600" }}>What changed</Text>
              {digest.entries.map((entry) => (
                <Pressable key={entry.session.id} accessibilityRole="button" onPress={() => openSubject({ kind: "session", id: entry.session.id, title: entry.session.title })} style={{ gap: 6, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: palette.border }}>
                  <Text style={{ color: palette.muted, fontSize: 12 }}>
                    {clock(entry.session.startedAt)} · {entry.session.harness}
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
