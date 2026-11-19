import { describe, expect, it } from "vitest";
import { articleBody, parseInline, parseMarkdown } from "./markdown";
import { factLabel } from "./format";

describe("parseMarkdown", () => {
  it("reads headings, nested lists, wrapped items, fences and tables", () => {
    const blocks = parseMarkdown(
      [
        "### Services",
        "- **DeepSeek:** `:8041`, built on `/nvme/ds41`.",
        "  - nested detail",
        "- Second item that",
        "  wraps onto a second line.",
        "",
        "1. Stop the workers.",
        "2. Restore.",
        "",
        "See [the runbook](https://example.com/runbook).",
        "",
        "```",
        "rh db status",
        "```",
        "",
        "> a quote",
        "",
        "---",
        "",
        "| Key | Value |",
        "| --- | --- |",
        "| port | 5174 |",
      ].join("\n"),
    );
    expect(blocks.map((b) => b.kind)).toEqual(["heading", "list", "list", "paragraph", "code", "quote", "rule", "table"]);
    const bullets = blocks[1];
    expect(bullets?.kind).toBe("list");
    if (bullets?.kind === "list") {
      expect(bullets.ordered).toBe(false);
      expect(bullets.items[0]?.children[0]?.kind).toBe("list");
      expect(bullets.items[1]?.text).toBe("Second item that wraps onto a second line.");
    }
    const table = blocks.at(-1);
    expect(table?.kind).toBe("table");
    if (table?.kind === "table") {
      expect(table.head).toEqual(["Key", "Value"]);
      expect(table.rows).toEqual([["port", "5174"]]);
    }
  });

  it("leaves snake_case names as plain text and does not treat raw HTML as markup", () => {
    const blocks = parseMarkdown("Set `embed_model` and memory_models in /etc/rh_config.\n\n<img src=x> and [x](javascript:alert(1))");
    expect(blocks.map((b) => b.kind)).toEqual(["paragraph", "paragraph"]);
    const first = blocks[0];
    expect(first?.kind).toBe("paragraph");
    if (first?.kind === "paragraph") {
      expect(parseInline(first.text).some((n) => n.kind === "code" && n.text === "embed_model")).toBe(true);
      expect(first.text).toContain("memory_models");
    }
    const second = blocks[1];
    expect(second?.kind).toBe("paragraph");
    if (second?.kind === "paragraph") {
      const nodes = parseInline(second.text);
      const link = nodes.find((n) => n.kind === "link");
      // The token keeps the href. Renderers open only http(s) and in-app paths.
      expect(link?.kind === "link" && (/^https?:\/\//i.test(link.href) || link.href.startsWith("/"))).toBe(false);
      expect(second.text).toContain("<img src=x>");
      expect(second.text).toContain("[x](javascript:alert(1))");
    }
  });
});

describe("articleBody", () => {
  const page = ["# gpubox", "", "A GPU host.", "", "### Services", "- one", "", "### Current facts", "- **ip**: 192.0.2.13", "", "### Later", "kept"].join("\n");

  it("drops a first heading that repeats the title", () => {
    expect(articleBody(page, "gpubox").startsWith("A GPU host.")).toBe(true);
    expect(articleBody(page, "something else").startsWith("# gpubox")).toBe(true);
  });

  it("drops the worker's Current facts list only when asked, and only that section", () => {
    const body = articleBody(page, "gpubox", { dropFacts: true, dropLead: "A GPU host." });
    expect(body).not.toContain("Current facts");
    expect(body).not.toContain("192.0.2.13");
    expect(body).not.toContain("A GPU host.");
    expect(body).toContain("### Services");
    expect(body).toContain("### Later\nkept");
    expect(articleBody(page, "gpubox")).toContain("### Current facts");
  });
});

describe("factLabel", () => {
  it("reads the worker's attribute names as labels and leaves a person's wording alone", () => {
    expect(factLabel("ip")).toBe("IP");
    expect(factLabel("gpus")).toBe("GPUs");
    expect(factLabel("backup-time")).toBe("Backup time");
    expect(factLabel("other-incident-silent-stop")).toBe("Incident silent stop");
    expect(factLabel("ssh-access")).toBe("SSH access");
    expect(factLabel("Backup time")).toBe("Backup time");
  });
});
