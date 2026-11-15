import { groupSummary, replyMeta, thoughtSummary, toolCategory, toolLabel, verdict, type Exchange, type Step, type ToolCategory, type ToolPart } from "@rivethub/client-runtime/exchange";
import { useState, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { useTheme } from "../theme/Theme";
import { RichText } from "../ui/chrome";
import { clock } from "../ui/format";

/** How many lines of a tool's answer show, counted from the end. */
const BODY_LINES = 40;
/** A reply longer than this is clipped until the person asks for all of it. */
const LONG_REPLY = 1200;

const GLYPH: Record<ToolCategory, string> = { read: "▤", search: "⌕", edit: "✎", command: "❯", web: "◎", subagent: "⑂", tool: "◇" };

/** A line that opens and closes what is under it. The whole line is the touch target. */
function Fold({ label, minHeight, startOpen, children }: { label: ReactNode; minHeight: number; startOpen?: boolean; children: ReactNode }) {
  const { palette } = useTheme();
  const [open, setOpen] = useState(startOpen ?? false);
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((was) => !was)}
        style={{ minHeight, flexDirection: "row", alignItems: "center", gap: 6 }}
      >
        <Text style={{ color: palette.muted, fontSize: 13, width: 14 }}>{open ? "▾" : "▸"}</Text>
        {label}
      </Pressable>
      {open ? children : null}
    </View>
  );
}

function tail(text: string): string {
  const lines = text.replace(/\s+$/, "").split("\n");
  const skipped = lines.length - BODY_LINES;
  return skipped > 0 ? [`… ${skipped} earlier lines`, ...lines.slice(skipped)].join("\n") : lines.join("\n");
}

/** What a tool was called with, as a person would type or read it. */
function asked(tool: ToolPart): string {
  const input = tool.input;
  if (!input || Object.keys(input).length === 0) return "";
  const command = input.command ?? input.cmd;
  if (toolCategory(tool.name) === "command" && typeof command === "string") return command;
  return Object.entries(input)
    .map(([key, value]) => `${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`)
    .join("\n");
}

function ToolRow({ tool }: { tool: ToolPart }) {
  const { palette } = useTheme();
  const input = asked(tool);
  const result = tool.result?.trim() ?? "";
  const label = toolLabel(tool);
  const line = (
    <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 6 }}>
      <Text style={{ color: palette.muted, fontSize: 13, width: 16, textAlign: "center" }}>{GLYPH[toolCategory(tool.name)]}</Text>
      <Text style={{ color: palette.muted, fontSize: 13, fontWeight: "600" }}>{tool.name}</Text>
      {label !== tool.name ? <Text numberOfLines={1} style={{ flex: 1, color: palette.muted, fontSize: 12, fontFamily: "monospace" }}>{label}</Text> : <View style={{ flex: 1 }} />}
      {tool.status === "error" ? <Text style={{ color: palette.warning, fontSize: 12 }}>failed</Text> : null}
      {tool.status === "running" ? <Text style={{ color: palette.muted, fontSize: 12 }}>running</Text> : null}
    </View>
  );
  if (input === "" && result === "") return <View style={{ minHeight: 32, flexDirection: "row", alignItems: "center", paddingLeft: 20 }}>{line}</View>;
  return (
    <View style={{ paddingLeft: 6 }}>
      <Fold label={line} minHeight={44}>
        <View style={{ marginLeft: 20, marginBottom: 6, borderWidth: 1, borderColor: palette.border, borderRadius: 8, overflow: "hidden" }}>
          {input !== "" ? <Text style={{ backgroundColor: palette.code, color: palette.foreground, fontSize: 12, lineHeight: 17, fontFamily: "monospace", padding: 8 }}>{input}</Text> : null}
          {result !== "" ? <Text style={{ color: palette.muted, fontSize: 12, lineHeight: 17, fontFamily: "monospace", padding: 8 }}>{tail(result)}</Text> : null}
        </View>
      </Fold>
    </View>
  );
}

function StepView({ step }: { step: Step }) {
  const { palette } = useTheme();
  const dim = { color: palette.muted, fontSize: 13 };
  if (step.kind === "thought") {
    const summary = thoughtSummary(step.text);
    return (
      <Fold minHeight={44} label={<Text numberOfLines={1} style={{ ...dim, flex: 1 }}>Think{summary !== "" ? ` · ${summary}` : ""}</Text>}>
        <Text style={{ ...dim, lineHeight: 19, paddingLeft: 20, paddingBottom: 6 }}>{step.text.trim()}</Text>
      </Fold>
    );
  }
  if (step.kind === "note") return <RichText text={step.text} style={{ ...dim, lineHeight: 19, paddingLeft: 20 }} />;
  return (
    <Fold minHeight={44} label={<Text numberOfLines={1} style={{ ...dim, flex: 1 }}>{groupSummary(step.tools)}</Text>}>
      <View>{step.tools.map((tool, index) => <ToolRow key={index} tool={tool} />)}</View>
    </Fold>
  );
}

/**
 * One prompt and its answer, laid out as a chat, as the web app lays it out: the prompt bubble the caller
 * draws, the agent's steps folded under a line that says how long it took, then the reply. `open` unfolds
 * the steps, as a link from the summary into these messages does.
 */
export function ExchangeCard({ exchange, prompt, open }: { exchange: Exchange; prompt: ReactNode; open: boolean }) {
  const { palette } = useTheme();
  const [full, setFull] = useState(false);
  const { steps, answer } = exchange;
  const reply = answer.trim();
  const long = reply.length > LONG_REPLY;
  const meta = [exchange.endedAt ? clock(exchange.endedAt) : "", replyMeta(exchange)].filter(Boolean).join(" · ");
  const silent = exchange.prompt !== undefined && steps.length === 0 && reply === "";
  return (
    <View style={{ gap: 8 }}>
      {prompt}
      {steps.length > 0 ? (
        <View style={{ borderBottomWidth: open ? 0 : 1, borderBottomColor: palette.border }}>
          <Fold startOpen={open} minHeight={44} label={<Text numberOfLines={1} style={{ flex: 1, color: palette.muted, fontSize: 13 }}>{verdict(exchange)}</Text>}>
            <View style={{ gap: 2, paddingBottom: 6 }}>{steps.map((step, index) => <StepView key={index} step={step} />)}</View>
          </Fold>
        </View>
      ) : null}
      {reply !== "" ? (
        <View style={{ maxHeight: long && !full ? 320 : undefined, overflow: "hidden" }}>
          <RichText text={reply} style={{ color: palette.foreground, fontSize: 15, lineHeight: 22 }} />
        </View>
      ) : null}
      {long ? (
        <Pressable accessibilityRole="button" onPress={() => setFull((was) => !was)} style={{ minHeight: 44, justifyContent: "center" }}>
          <Text style={{ color: palette.info }}>{full ? "Show less" : "Show all"}</Text>
        </Pressable>
      ) : null}
      {silent ? <Text style={{ color: palette.muted, fontSize: 13 }}>{exchange.stopped ? "Stopped" : "No reply"}</Text> : null}
      {meta !== "" && (reply !== "" || steps.length > 0) ? <Text numberOfLines={1} style={{ color: palette.muted, fontSize: 11 }}>{meta}</Text> : null}
    </View>
  );
}
