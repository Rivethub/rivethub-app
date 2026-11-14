import type { TopicId } from "@rivethub/contracts";
import { useState, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { useCreateTopic } from "../data/queries";
import { useHub } from "../hub/HubContext";
import { useTheme } from "../theme/Theme";
import { GhostButton, PrimaryButton, TextField } from "../ui/chrome";
import { errorText } from "../ui/format";

/** Shown only when this hub can create a topic by hand. `heading` sits beside the closed control and above the open form. */
export function NewTopic({ label = "New topic", heading, onCreated }: { label?: string; heading?: ReactNode; onCreated?: (id: TopicId) => void }) {
  const { client } = useHub();
  const { palette } = useTheme();
  const create = useCreateTopic();
  const [name, setName] = useState<string | null>(null);
  if (!client.createTopic) return heading ? <>{heading}</> : null;
  if (name === null) {
    const trigger = (
      <Pressable accessibilityRole="button" onPress={() => setName("")} style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 8 }}>
        <Text style={{ color: palette.info, fontSize: 15 }}>{label}</Text>
      </Pressable>
    );
    if (!heading) return trigger;
    return (
      <View style={{ flexDirection: "row", alignItems: "center", paddingRight: 8 }}>
        <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 8 }}>{heading}</View>
        {trigger}
      </View>
    );
  }
  const save = () => {
    const trimmed = name.trim();
    if (!trimmed || create.isPending) return;
    create.mutate(
      { name: trimmed },
      {
        onSuccess: (id) => {
          setName(null);
          onCreated?.(id as TopicId);
        },
      },
    );
  };
  return (
    <View style={heading ? { gap: 8, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 } : { gap: 8, paddingVertical: 4 }}>
      {heading}
      <TextField label="Topic name" value={name} onChangeText={setName} placeholder="Topic name" autoFocus />
      {create.isError ? <Text style={{ color: palette.error, fontSize: 13 }}>{errorText(create.error)}</Text> : null}
      <View style={{ flexDirection: "row", gap: 8 }}>
        <View style={{ flex: 1 }}>
          <PrimaryButton label={create.isPending ? "Creating…" : "Create"} onPress={save} disabled={create.isPending || !name.trim()} />
        </View>
        <View style={{ flex: 1 }}>
          <GhostButton label="Cancel" onPress={() => setName(null)} />
        </View>
      </View>
    </View>
  );
}
