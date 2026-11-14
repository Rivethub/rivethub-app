import type { ReactNode } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, Text, TextInput, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNotice } from "../data/queries";
import { useHub } from "../hub/HubContext";
import { alpha } from "../theme/tokens";
import { useTheme } from "../theme/Theme";
import { InlineText } from "./markdown";

export function Screen({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  return <View style={[{ flex: 1, backgroundColor: palette.background, paddingTop: insets.top }, style]}>{children}</View>;
}

export function HubChip() {
  const { current, setOpen } = useHub();
  const { palette } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Memory hub and settings"
      onPress={() => setOpen(true)}
      style={{
        minHeight: 44,
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 12,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: palette.border,
        backgroundColor: palette.card,
      }}
    >
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: current ? palette.success : palette.muted }} />
      <Text style={{ color: palette.foreground, fontSize: 13 }}>{current?.name ?? "Sample"} ▾</Text>
    </Pressable>
  );
}

export function DataBanner({ reaching }: { reaching?: boolean }) {
  const notice = useNotice();
  const { palette } = useTheme();
  const text = notice?.message ?? (reaching ? "Reaching the hub. Showing saved or sample memory until it answers." : null);
  if (!text) return null;
  return (
    <View
      accessibilityRole="alert"
      style={{
        marginHorizontal: 16,
        marginBottom: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 12,
        backgroundColor: alpha(palette.warning, 0.12),
        borderWidth: 1,
        borderColor: alpha(palette.warning, 0.4),
      }}
    >
      <Text style={{ color: palette.foreground, fontSize: 13, lineHeight: 18 }}>{text}</Text>
    </View>
  );
}

export function BackButton({ onPress }: { onPress: () => void }) {
  const { palette } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onPress} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: palette.foreground, fontSize: 28, lineHeight: 32 }}>‹</Text>
    </Pressable>
  );
}

export function Segment({ options, value, onChange }: { options: { id: string; label: string }[]; value: string; onChange: (id: string) => void }) {
  const { palette } = useTheme();
  return (
    <View style={{ flexDirection: "row", padding: 3, borderRadius: 10, backgroundColor: palette.card }}>
      {options.map((option) => {
        const selected = option.id === value;
        return (
          <Pressable
            key={option.id}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.id)}
            style={{
              flex: 1,
              minHeight: 44,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 8,
              backgroundColor: selected ? palette.background : "transparent",
            }}
          >
            <Text style={{ color: selected ? palette.foreground : palette.muted, fontSize: 13, fontWeight: selected ? "600" : "400" }}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal transparent visible animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1, justifyContent: "flex-end" }}>
        <Pressable accessibilityLabel="Dismiss" onPress={onClose} style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "rgba(0,0,0,0.5)" }} />
        <View style={{ borderTopLeftRadius: 22, borderTopRightRadius: 22, backgroundColor: palette.sidebar, borderTopWidth: 1, borderColor: palette.border, paddingHorizontal: 16, paddingTop: 10, paddingBottom: insets.bottom + 16, gap: 12 }}>
          <View style={{ alignSelf: "center", width: 40, height: 5, borderRadius: 3, backgroundColor: palette.input }} />
          <Text style={{ color: palette.foreground, fontSize: 17, fontWeight: "600" }}>{title}</Text>
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function KindTag({ label, color }: { label: string; color: string }) {
  return (
    <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: alpha(color, 0.14) }}>
      <Text style={{ color, fontSize: 11, fontWeight: "600" }}>{label}</Text>
    </View>
  );
}

export function Loading({ label }: { label: string }) {
  const { palette } = useTheme();
  return (
    <View style={{ padding: 24 }}>
      <Text style={{ color: palette.muted, fontSize: 15 }}>{label}</Text>
    </View>
  );
}

export function PrimaryButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  const { palette } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={{ minHeight: 48, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: palette.primary, opacity: disabled ? 0.55 : 1, paddingHorizontal: 14 }}
    >
      <Text style={{ color: palette.primaryForeground, fontWeight: "600", fontSize: 15 }}>{label}</Text>
    </Pressable>
  );
}

export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  secure,
  autoFocus,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  secure?: boolean;
  autoFocus?: boolean;
}) {
  const { palette } = useTheme();
  const focus = autoFocus ? { autoFocus: true as const } : {};
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: palette.muted, fontSize: 12 }}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={palette.muted}
        secureTextEntry={secure}
        autoCapitalize="none"
        autoCorrect={false}
        {...focus}
        style={{
          minHeight: 48,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: palette.border,
          backgroundColor: palette.background,
          color: palette.foreground,
          paddingHorizontal: 12,
          fontSize: 16,
        }}
      />
    </View>
  );
}

export function GhostButton({ label, onPress, danger }: { label: string; onPress: () => void; danger?: boolean }) {
  const { palette } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={{ minHeight: 48, borderRadius: 12, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: palette.border, paddingHorizontal: 12 }}
    >
      <Text style={{ color: danger ? palette.error : palette.foreground, fontSize: 15 }}>{label}</Text>
    </Pressable>
  );
}

export function RichText({ text, style, numberOfLines }: { text: string; style?: StyleProp<TextStyle>; numberOfLines?: number }) {
  const lines = numberOfLines === undefined ? {} : { numberOfLines };
  return <InlineText text={text} style={style} {...lines} />;
}
