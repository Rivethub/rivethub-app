import { parseInline, parseMarkdown, type Block, type Inline } from "@rivethub/client-runtime/markdown";
import { Linking, ScrollView, Text, View, type StyleProp, type TextStyle } from "react-native";
import { navigationRef } from "../nav/ref";
import { useTheme } from "../theme/Theme";
import { inAppTarget } from "./links";

/** The shared article blocks, drawn with the phone's type and colors. Raw HTML is never interpreted. */
export function MarkdownView({ source }: { source: string }) {
  const blocks = parseMarkdown(source);
  if (blocks.length === 0) return null;
  return (
    <View style={{ gap: 12 }}>
      {blocks.map((block, index) => (
        <BlockView key={index} block={block} />
      ))}
    </View>
  );
}

function openHref(href: string) {
  const target = inAppTarget(href);
  if (!target) return;
  if (target.kind === "external") {
    void Linking.openURL(target.href);
    return;
  }
  if (!navigationRef.isReady()) return;
  if (target.kind === "topic") navigationRef.navigate("Topic", { id: target.id });
  else if (target.kind === "entity") navigationRef.navigate("Entity", { id: target.id });
  else navigationRef.navigate("Session", { id: target.id });
}

/** One paragraph of hub Markdown: code, emphasis, and links that open in the app. */
export function InlineText({ text, style, numberOfLines }: { text: string; style?: StyleProp<TextStyle>; numberOfLines?: number }) {
  const lines = numberOfLines === undefined ? {} : { numberOfLines };
  return (
    <Text style={style} {...lines}>
      <InlineRuns nodes={parseInline(text)} base={{}} />
    </Text>
  );
}

function InlineRuns({ nodes, base }: { nodes: Inline[]; base: TextStyle }) {
  const { palette } = useTheme();
  return (
    <>
      {nodes.map((node, index) => {
        if (node.kind === "text") return node.text;
        if (node.kind === "code") {
          return (
            <Text key={index} style={{ fontFamily: "monospace", fontSize: 13, color: palette.foreground, backgroundColor: palette.code }}>
              {node.text}
            </Text>
          );
        }
        if (node.kind === "strong") {
          return (
            <Text key={index} style={{ fontWeight: "700", color: palette.foreground }}>
              <InlineRuns nodes={node.children} base={base} />
            </Text>
          );
        }
        if (node.kind === "em") {
          return (
            <Text key={index} style={{ fontStyle: "italic" }}>
              <InlineRuns nodes={node.children} base={base} />
            </Text>
          );
        }
        const tappable = /^https?:\/\//i.test(node.href) || node.href.startsWith("/");
        return (
          <Text key={index} style={{ color: palette.info }} onPress={tappable ? () => openHref(node.href) : undefined} suppressHighlighting>
            <InlineRuns nodes={node.children} base={base} />
          </Text>
        );
      })}
    </>
  );
}

function RichLine({ text, style }: { text: string; style: TextStyle }) {
  return (
    <Text style={style}>
      <InlineRuns nodes={parseInline(text)} base={style} />
    </Text>
  );
}

function BlockView({ block }: { block: Block }) {
  const { palette } = useTheme();
  const body: TextStyle = { color: palette.foreground, fontSize: 16, lineHeight: 24 };
  switch (block.kind) {
    case "heading": {
      const level = Math.min(Math.max(block.level, 2), 4);
      const size = level === 2 ? 20 : level === 3 ? 17 : 15;
      return (
        <RichLine
          text={block.text}
          style={{
            color: palette.foreground,
            fontSize: size,
            lineHeight: size + 6,
            fontWeight: "600",
            marginTop: 6,
            paddingBottom: level === 2 ? 4 : 0,
            borderBottomWidth: level === 2 ? 1 : 0,
            borderBottomColor: palette.border,
          }}
        />
      );
    }
    case "paragraph":
      return <RichLine text={block.text} style={body} />;
    case "code":
      return (
        <ScrollView horizontal showsHorizontalScrollIndicator nestedScrollEnabled style={{ backgroundColor: palette.code, borderRadius: 8 }} contentContainerStyle={{ padding: 12 }}>
          <Text style={{ fontFamily: "monospace", color: palette.foreground, fontSize: 13, lineHeight: 20 }}>{block.text}</Text>
        </ScrollView>
      );
    case "quote":
      return (
        <View style={{ borderLeftWidth: 2, borderLeftColor: palette.input, paddingLeft: 12 }}>
          <RichLine text={block.text} style={{ ...body, color: palette.muted }} />
        </View>
      );
    case "rule":
      return <View style={{ height: 1, backgroundColor: palette.border, marginVertical: 4 }} />;
    case "list":
      return (
        <View style={{ gap: 6, paddingLeft: 4 }}>
          {block.items.map((item, index) => (
            <View key={index} style={{ flexDirection: "row", gap: 8 }}>
              <Text style={{ color: palette.muted, fontSize: 16, lineHeight: 24, width: 18 }}>{block.ordered ? `${index + 1}.` : "•"}</Text>
              <View style={{ flex: 1, gap: 6 }}>
                <RichLine text={item.text} style={body} />
                {item.children.map((child, childIndex) => (
                  <BlockView key={childIndex} block={child} />
                ))}
              </View>
            </View>
          ))}
        </View>
      );
    case "table":
      return (
        <ScrollView horizontal showsHorizontalScrollIndicator nestedScrollEnabled>
          <View>
            <View style={{ flexDirection: "row", borderBottomWidth: 1, borderBottomColor: palette.input }}>
              {block.head.map((cell, index) => (
                <View key={index} style={{ width: 140, paddingHorizontal: 8, paddingVertical: 6 }}>
                  <RichLine text={cell} style={{ color: palette.foreground, fontSize: 14, fontWeight: "600" }} />
                </View>
              ))}
            </View>
            {block.rows.map((row, rowIndex) => (
              <View key={rowIndex} style={{ flexDirection: "row", borderBottomWidth: 1, borderBottomColor: palette.border }}>
                {row.map((cell, index) => (
                  <View key={index} style={{ width: 140, paddingHorizontal: 8, paddingVertical: 6 }}>
                    <RichLine text={cell} style={{ color: palette.foreground, fontSize: 14, lineHeight: 20 }} />
                  </View>
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
      );
  }
}
