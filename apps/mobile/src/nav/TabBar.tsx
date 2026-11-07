import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useReviewQueue } from "../data/queries";
import { useTheme } from "../theme/Theme";
import { IconLibrary, IconReview, IconSearch, IconToday } from "../ui/icons";

const ICONS = {
  Today: IconToday,
  Review: IconReview,
  Library: IconLibrary,
  Search: IconSearch,
} as const;

export function TabBar({ state, navigation }: BottomTabBarProps) {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const review = useReviewQueue();
  const badge = review.data?.length ? String(review.data.length) : "";
  return (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: "row",
        borderTopWidth: 1,
        borderTopColor: palette.border,
        backgroundColor: palette.sidebar,
        paddingTop: 6,
        paddingBottom: Math.max(insets.bottom, 12),
        paddingHorizontal: 8,
      }}
    >
      {state.routes.map((route, index) => {
        const focused = state.index === index;
        const color = focused ? palette.primary : palette.muted;
        const Icon = ICONS[route.name as keyof typeof ICONS] ?? IconToday;
        const onPress = () => {
          const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
        };
        return (
          <Pressable key={route.key} accessibilityRole="tab" accessibilityState={{ selected: focused }} accessibilityLabel={route.name} onPress={onPress} style={{ flex: 1, minHeight: 48, alignItems: "center", justifyContent: "center", gap: 3 }}>
            <Icon color={color} />
            <Text style={{ color, fontSize: 11 }}>{route.name}</Text>
            {route.name === "Review" && badge ? (
              <View style={{ position: "absolute", top: 0, left: "54%", borderRadius: 999, backgroundColor: palette.warning, paddingHorizontal: 5 }}>
                <Text style={{ color: palette.primaryForeground, fontSize: 10, fontWeight: "700" }}>{badge}</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}
