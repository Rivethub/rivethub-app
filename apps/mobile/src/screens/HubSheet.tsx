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
  const { hubs, current, pairError, pendingPair, confirmPendingPair, cancelPendingPair, setOpen, selectHub } = useHub();

  const openSettings = (section: SettingsSection) => {
    setOpen(false);
    if (navigationRef.isReady()) navigationRef.navigate("Settings", { section });
  };

  const replacesExisting = pendingPair ? hubs.some((hub) => hub.url === pendingPair.url) : false;

  return (
    <Sheet title="Hub" onClose={() => setOpen(false)}>
      {pairError ? <Text style={{ color: palette.error, fontSize: 13 }}>{pairError}</Text> : null}
      {pendingPair ? (
        <View
          style={{
            borderWidth: 1,
            borderColor: palette.border,
            borderRadius: 12,
            padding: 12,
            gap: 8,
            backgroundColor: palette.card,
          }}
        >
          <Text style={{ color: palette.foreground, fontSize: 15, fontWeight: "600" }}>
            {replacesExisting ? `Replace connection to ${pendingPair.name}?` : `Connect to ${pendingPair.name}?`}
          </Text>
          <Text style={{ color: palette.muted, fontSize: 13 }}>{pendingPair.url}</Text>
          <Text style={{ color: palette.muted, fontSize: 12 }}>
            {pendingPair.token
              ? "This pairing link includes an access token and will make this your active hub."
              : "This will add the hub and make it active."}
          </Text>
          <View style={{ flexDirection: "row", gap: 10, paddingTop: 4 }}>
            <Pressable
              accessibilityRole="button"
              onPress={() => void confirmPendingPair()}
              style={{
                flex: 1,
                minHeight: 40,
                borderRadius: 8,
                backgroundColor: palette.primary,
                alignItems: "center",
                justifyContent: "center",
                paddingHorizontal: 12,
              }}
            >
              <Text style={{ color: palette.primaryForeground, fontSize: 14, fontWeight: "600" }}>Connect</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={cancelPendingPair}
              style={{
                minHeight: 40,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: palette.border,
                alignItems: "center",
                justifyContent: "center",
                paddingHorizontal: 14,
              }}
            >
              <Text style={{ color: palette.foreground, fontSize: 14 }}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
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
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          setOpen(false);
          if (navigationRef.isReady()) navigationRef.navigate("Stats");
        }}
        style={{ minHeight: 48, justifyContent: "center" }}
      >
        <Text style={{ color: palette.foreground, fontSize: 16 }}>Stats</Text>
        <Text style={{ color: palette.muted, fontSize: 12 }}>What is in memory, and whether it is keeping up</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          setOpen(false);
          if (navigationRef.isReady()) navigationRef.navigate("Shared");
        }}
        style={{ minHeight: 48, justifyContent: "center" }}
      >
        <Text style={{ color: palette.foreground, fontSize: 16 }}>Shared</Text>
        <Text style={{ color: palette.muted, fontSize: 12 }}>What is shared with each space</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          setOpen(false);
          if (navigationRef.isReady()) navigationRef.navigate("Guide");
        }}
        style={{ minHeight: 48, justifyContent: "center" }}
      >
        <Text style={{ color: palette.foreground, fontSize: 16 }}>Guide</Text>
        <Text style={{ color: palette.muted, fontSize: 12 }}>The path from a first session to sharing</Text>
      </Pressable>
      {ROWS.map((row) => (
        <Pressable key={row.section} accessibilityRole="button" onPress={() => openSettings(row.section)} style={{ minHeight: 48, justifyContent: "center" }}>
          <Text style={{ color: palette.foreground, fontSize: 16 }}>{row.label}</Text>
          <Text style={{ color: palette.muted, fontSize: 12 }}>{row.hint}</Text>
        </Pressable>
      ))}
    </Sheet>
  );
}
