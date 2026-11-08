import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { useHub } from "../hub/HubContext";
import { parseHubInput } from "../hub/pair";
import type { RootParams } from "../nav/types";
import { useTheme } from "../theme/Theme";
import { BackButton, GhostButton, PrimaryButton, Screen, TextField } from "../ui/chrome";
import { errorText, hostOf } from "../ui/format";

type Props = NativeStackScreenProps<RootParams, "AddHub">;

export function AddHubScreen({ navigation }: Props) {
  const { palette } = useTheme();
  const { hubs, removeHub, addHub } = useHub();
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();

  const applyCode = (raw: string) => {
    const parsed = parseHubInput(raw);
    if (!parsed) {
      setError("That code is not a hub URL or pairing link.");
      return;
    }
    setUrl(parsed.url);
    if ("name" in parsed) setName(parsed.name);
    if ("token" in parsed && parsed.token) setToken(parsed.token);
    setError(null);
    setScanning(false);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    const input: { url: string; name: string; token?: string } = { url, name: name.trim() };
    const trimmed = token.trim();
    if (trimmed) input.token = trimmed;
    try {
      await addHub(input);
      navigation.goBack();
    } catch (caught) {
      const message = errorText(caught);
      setError(message.startsWith("Enter a hub") || message.startsWith("Name the hub") ? message : "Could not store this hub on the phone.");
    } finally {
      setSaving(false);
    }
  };

  const scan = async () => {
    if (!permission?.granted) {
      const next = await requestPermission();
      if (!next.granted) {
        setError("Camera permission is required to scan a pairing code.");
        return;
      }
    }
    setScanning(true);
  };

  return (
    <Screen>
      <View style={{ flexDirection: "row", alignItems: "center", paddingRight: 16 }}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={{ color: palette.foreground, fontSize: 17, fontWeight: "600" }}>Connect to a hub</Text>
      </View>
      {scanning ? (
        <View style={{ flex: 1, margin: 16, borderRadius: 16, overflow: "hidden" }}>
          <CameraView
            style={{ flex: 1 }}
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={({ data }) => applyCode(data)}
          />
          <GhostButton label="Cancel scan" onPress={() => setScanning(false)} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }} keyboardShouldPersistTaps="handled">
          <Text style={{ color: palette.muted, fontSize: 13, lineHeight: 18 }}>
            Type the hub URL, or scan a pairing code. On the Android emulator this machine is https://10.0.2.2:5174. A phone on the same network needs the machine's LAN address.
          </Text>
          <TextField label="Hub URL" value={url} onChangeText={setUrl} placeholder="https://10.0.2.2:5174" />
          <TextField label="Name" value={name} onChangeText={setName} placeholder="My desktop" />
          <TextField label="Token, optional" value={token} onChangeText={setToken} placeholder="Bearer token" secure />
          {error ? <Text style={{ color: palette.error, fontSize: 13 }}>{error}</Text> : null}
          <PrimaryButton label={saving ? "Saving…" : "Save hub"} onPress={() => void save()} disabled={saving} />
          <GhostButton label="Scan a pairing code" onPress={() => void scan()} />
          {hubs.length > 0 ? (
            <View style={{ gap: 4, marginTop: 8 }}>
              <Text style={{ color: palette.muted, fontSize: 12, fontWeight: "600" }}>SAVED HUBS</Text>
              {hubs.map((hub) => (
                <View key={hub.id} style={{ minHeight: 56, flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: palette.foreground }}>{hub.name}</Text>
                    <Text style={{ color: palette.muted, fontSize: 12 }}>{hostOf(hub.url)}</Text>
                  </View>
                  <Pressable accessibilityRole="button" onPress={() =>
                      Alert.alert(`Forget ${hub.name}?`, "The phone drops this hub and its token. Pair again to get it back.", [
                        { text: "Cancel", style: "cancel" },
                        { text: "Forget", style: "destructive", onPress: () => void removeHub(hub.id) },
                      ])
                    } style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 8 }}>
                    <Text style={{ color: palette.error }}>Forget</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}
        </ScrollView>
      )}
    </Screen>
  );
}
