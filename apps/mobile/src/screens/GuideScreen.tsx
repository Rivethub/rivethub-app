import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Pressable, ScrollView, Text, View } from "react-native";
import { STAGES, type Step } from "../lib/journey";
import { setGuideHidden, useJourney } from "../lib/journeyStore";
import { openStep } from "../nav/go";
import type { RootParams } from "../nav/types";
import { useTheme } from "../theme/Theme";
import { BackButton, Screen } from "../ui/chrome";

type Props = NativeStackScreenProps<RootParams, "Guide">;

export function GuideScreen({ navigation }: Props) {
  const { palette } = useTheme();
  const journey = useJourney();
  return (
    <Screen>
      <View style={{ flexDirection: "row", alignItems: "center", paddingRight: 16 }}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={{ color: palette.foreground, fontSize: 17, fontWeight: "600" }}>Guide</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 22, paddingBottom: 40 }}>
        <Text style={{ color: palette.muted, fontSize: 15, lineHeight: 22 }}>
          RivetHub is useful from the first captured session. Each step below adds something on top, in the order most people want it.
        </Text>
        <View style={{ gap: 8 }}>
          <Text style={{ color: palette.muted, fontSize: 13, lineHeight: 18 }}>
            {journey.finished
              ? "You have done every step. The rest is using it."
              : `${journey.doneCount} of ${journey.steps.length} done. Do them in any order; each one stands on its own.`}
          </Text>
          <Progress done={journey.doneCount} total={journey.steps.length} />
          {journey.hidden && !journey.finished ? (
            <Text style={{ color: palette.muted, fontSize: 13, lineHeight: 18 }}>
              The next step is hidden on Today.{" "}
              <Text style={{ color: palette.info }} onPress={() => setGuideHidden(false)}>
                Show it again
              </Text>
            </Text>
          ) : null}
        </View>
        {STAGES.map((stage, index) => (
          <View key={stage.id} style={{ gap: 10 }}>
            <View style={{ gap: 2 }}>
              <Text style={{ color: palette.foreground, fontSize: 15, fontWeight: "600" }}>
                <Text style={{ color: palette.muted }}>{index + 1}. </Text>
                {stage.title}
              </Text>
              <Text style={{ color: palette.muted, fontSize: 13 }}>{stage.gain}</Text>
            </View>
            {journey.steps
              .filter((step) => step.stage === stage.id)
              .map((step) => (
                <StepRow key={step.id} step={step} current={step.id === journey.next?.id} />
              ))}
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}

function StepRow({ step, current }: { step: Step; current: boolean }) {
  const { palette } = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        borderWidth: 1,
        borderColor: current ? palette.primary : palette.border,
        backgroundColor: palette.card,
        borderRadius: 12,
        padding: 14,
      }}
    >
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 11,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: step.done ? palette.primary : "transparent",
          borderWidth: step.done ? 0 : 1,
          borderColor: palette.input,
        }}
      >
        {step.done ? <Text style={{ color: palette.primaryForeground, fontSize: 12, fontWeight: "700" }}>✓</Text> : null}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text accessibilityLabel={`${step.title}, ${step.done ? "done" : "not done yet"}`} style={{ color: step.done ? palette.muted : palette.foreground, fontWeight: "600" }}>
          {step.title}
        </Text>
        <Text style={{ color: palette.muted, fontSize: 13, lineHeight: 18 }}>{step.why}</Text>
      </View>
      {step.done ? null : (
        <Pressable accessibilityRole="button" onPress={() => openStep(step.action.to)} style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 8 }}>
          <Text style={{ color: palette.info, fontSize: 13 }}>{step.action.label}</Text>
        </Pressable>
      )}
    </View>
  );
}

export function Progress({ done, total }: { done: number; total: number }) {
  const { palette } = useTheme();
  const width = `${total === 0 ? 0 : Math.round((done / total) * 100)}%` as `${number}%`;
  return (
    <View accessibilityRole="progressbar" style={{ height: 4, borderRadius: 999, backgroundColor: palette.input, overflow: "hidden", maxWidth: 360 }}>
      <View style={{ height: 4, width, borderRadius: 999, backgroundColor: palette.primary }} />
    </View>
  );
}
