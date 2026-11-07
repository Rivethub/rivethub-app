import { Pressable, Text, View } from "react-native";
import { useHub } from "../hub/HubContext";
import { navigationRef } from "../nav/ref";
import type { SettingsSection } from "../nav/types";
import { useTheme } from "../theme/Theme";
import { Sheet } from "../ui/chrome";
import { hostOf } from "../ui/format";

const ROWS: { section: SettingsSection; label: string; hint: string }[] = [
  { section: "connections", label: "Connections", hint: "Harnesses and models" },
  { section: "account", label: "Account and updates", hint: "Sign-in and versions" },
  { section: "sharing", label: "Sharing", hint: "People and spaces" },
  { section: "trust", label: "Trust rules", hint: "What skips Review" },
  { section: "appearance", label: "Appearance", hint: "Theme" },
];

export function HubSheet() {
  const { palette } = useTheme();
  const { hubs, current, pairError, setOpen, selectHub } = useHub();

  const openSettings = (section: SettingsSection) => {
    setOpen(false);
    if (navigationRef.isReady()) navigationRef.navigate("Settings", { section });
  };

  return (
    <Sheet title="Hub" onClose={() => setOpen(false)}>
      {pairError ? <Text style={{ color: palette.error, fontSize: 13 }}>{pairError}</Text> : null}
      {hubs.map((hub) => {
        const selected = hub.id === current?.id;
        return (
          <Pressable
            key={hub.id}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => void selectHub(hub.id)}
            style={{ minHeight: 52, flexDirection: "row", alignItems: "center", gap: 12 }}
          >
            <View style={{ width: 22, alignItems: "center" }}>
              {selected ? <Text style={{ color: palette.primary, fontSize: 16 }}>✓</Text> : null}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: palette.foreground, fontSize: 16 }}>{hub.name}</Text>
              <Text style={{ color: palette.muted, fontSize: 12 }}>{hostOf(hub.url)}</Text>
            </View>
          </Pressable>
        );
      })}
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          setOpen(false);
          if (navigationRef.isReady()) navigationRef.navigate("AddHub");
        }}
        style={{ minHeight: 48, justifyContent: "center" }}
      >
        <Text style={{ color: palette.info, fontSize: 16 }}>+ Connect to a hub…</Text>
      </Pressable>
      <View style={{ height: 1, backgroundColor: palette.border }} />
      {ROWS.map((row) => (
        <Pressable key={row.section} accessibilityRole="button" onPress={() => openSettings(row.section)} style={{ minHeight: 48, justifyContent: "center" }}>
          <Text style={{ color: palette.foreground, fontSize: 16 }}>{row.label}</Text>
          <Text style={{ color: palette.muted, fontSize: 12 }}>{row.hint}</Text>
        </Pressable>
      ))}
    </Sheet>
  );
}
