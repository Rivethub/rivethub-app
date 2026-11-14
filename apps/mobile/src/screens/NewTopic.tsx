import type { TopicId } from "@rivethub/contracts";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useCreateTopic } from "../data/queries";
import { useHub } from "../hub/HubContext";
import { useTheme } from "../theme/Theme";
import { GhostButton, PrimaryButton, TextField } from "../ui/chrome";
import { errorText } from "../ui/format";

/** Shown only when this hub can create a topic by hand. */
export function NewTopic({ label = "New topic", onCreated }: { label?: string; onCreated?: (id: TopicId) => void }) {
  const { client } = useHub();
  const { palette } = useTheme();
  const create = useCreateTopic();
  const [name, setName] = useState<string | null>(null);
  if (!client.createTopic) return null;
  if (name === null) {
    return (
      <Pressable accessibilityRole="button" onPress={() => setName("")} style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 8 }}>
        <Text style={{ color: palette.info, fontSize: 15 }}>{label}</Text>
      </Pressable>
    );
  }
  const save = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setName(null);
      return;
    }
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
    <View style={{ gap: 8, paddingVertical: 4 }}>
      <TextField label="Topic name" value={name} onChangeText={setName} placeholder="Topic name" />
      {create.isError ? <Text style={{ color: palette.error, fontSize: 13 }}>{errorText(create.error)}</Text> : null}
      <PrimaryButton label={create.isPending ? "Creating…" : "Create"} onPress={save} disabled={create.isPending || !name.trim()} />
      <GhostButton label="Cancel" onPress={() => setName(null)} />
    </View>
  );
}
