import { createMemoryHistory } from "@tanstack/react-router";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { App } from "../app";
import { articleBody, Markdown, parseMarkdown } from "../components/markdown";
import { createSampleClient } from "../dev/sample-client";
import { factLabel } from "../lib/format";

function renderAt(path: string) {
  const user = userEvent.setup();
  render(<App client={createSampleClient()} history={createMemoryHistory({ initialEntries: [path] })} />);
  return { user };
}

describe("Markdown", () => {
  it("renders what the workers write: headings, lists, code, bold and links", () => {
    render(
      <Markdown
        source={[
          "### Services",
          "- **DeepSeek:** `:8041`, built on `/nvme/ds41`.",
          "  - nested detail",
          "- Second item that",
          "  wraps onto a second line.",
          "",
          "1. Stop the workers.",
          "2. Restore.",
          "",
          "See [the runbook](https://example.com/runbook) and [a page](/topics/t-1).",
          "",
          "```",
          "rh db status",
          "```",
        ].join("\n")}
      />,
    );
    expect(screen.getByRole("heading", { level: 3, name: "Services" })).toBeInTheDocument();
    const [bullets, steps] = screen.getAllByRole("list").filter((l) => !l.closest("li"));
    expect(within(bullets!).getByText("DeepSeek:").tagName).toBe("STRONG");
    expect(within(bullets!).getByText(":8041").tagName).toBe("CODE");
    expect(within(bullets!).getByText("nested detail")).toBeInTheDocument();
    expect(within(bullets!).getByText(/Second item that wraps onto a second line\./)).toBeInTheDocument();
    expect(within(steps!).getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "the runbook" })).toHaveAttribute("rel", "noreferrer noopener");
    expect(screen.getByRole("link", { name: "a page" })).toHaveAttribute("href", "/topics/t-1");
    expect(screen.getByText("rh db status").closest("pre")).not.toBeNull();
  });

  it("never turns page text into markup", () => {
    const { container } = render(<Markdown source={'<img src=x onerror="alert(1)"> and [x](javascript:alert(1)) and <script>alert(1)</script>'} />);
    expect(container.querySelector("img, script")).toBeNull();
    expect(container.querySelector("a")).toBeNull();
    expect(container).toHaveTextContent('<img src=x onerror="alert(1)">');
  });

  it("gives each heading a stable id and numbers a repeated one", () => {
    render(<Markdown source={"## What **stays**\n\n## Services\n\n### Services\n\n## !!!"} />);
    expect(screen.getByRole("heading", { name: "What stays" })).toHaveAttribute("id", "what-stays");
    const services = screen.getAllByRole("heading", { name: "Services" });
    expect(services.map((heading) => heading.id)).toEqual(["services", "services-1"]);
    expect(screen.getByRole("heading", { name: "!!!" })).toHaveAttribute("id", "section");
  });

  it("leaves snake_case names and paths alone and reads a table", () => {
    const blocks = parseMarkdown("Set `embed_model` and memory_models in /etc/rh_config.\n\n| Key | Value |\n| --- | --- |\n| port | 5174 |");
    expect(blocks.map((b) => b.kind)).toEqual(["paragraph", "table"]);
    render(<Markdown source="memory_models stays, and so does /etc/rh_config_file." />);
    expect(screen.getByText("memory_models stays, and so does /etc/rh_config_file.")).toBeInTheDocument();
  });
});

describe("articleBody", () => {
  const page = ["# gpubox", "", "A GPU host.", "", "### Services", "- one", "", "### Current facts", "- **ip**: 10.0.0.7", "", "### Later", "kept"].join("\n");

  it("drops a first heading that repeats the title", () => {
    expect(articleBody(page, "gpubox").startsWith("A GPU host.")).toBe(true);
    expect(articleBody(page, "something else").startsWith("# gpubox")).toBe(true);
  });

  it("drops the worker's Current facts list only when asked, and only that section", () => {
    const body = articleBody(page, "gpubox", { dropFacts: true });
    expect(body).not.toContain("Current facts");
    expect(body).not.toContain("10.0.0.7");
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

describe("Pages show their article", () => {
  it("an entity page has its summary, the article, and its facts without the article's own facts list", async () => {
    renderAt("/entities/nas-01");
    expect(await screen.findByRole("heading", { level: 1, name: "nas-01" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { level: 3, name: "Backups" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Restoring" })).toBeInTheDocument();
    expect(screen.getByText("find -mtime +14").tagName).toBe("CODE");
    expect(screen.queryByRole("heading", { name: "Current facts" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 2, name: "nas-01" })).not.toBeInTheDocument();
    expect(screen.getByText(/last checked/)).toBeInTheDocument();
  });

  it("a topic page shows the whole article, not only its first paragraph", async () => {
    renderAt("/topics/rh-08");
    expect(await screen.findByRole("heading", { level: 3, name: "What stays" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "What moved out" })).toBeInTheDocument();
    expect(screen.getAllByText(/The release that turns the RivetHub runtime into a memory product/)).toHaveLength(1);
  });

  it("a topic page leads with its decisions and sessions, and the article follows", async () => {
    renderAt("/topics/rh-08");
    const article = await screen.findByRole("heading", { level: 3, name: "What stays" });
    const main = screen.getByRole("main");
    for (const name of ["Decisions", "Sessions"]) {
      const section = within(main).getByRole("heading", { level: 2, name: new RegExp(`^${name}`) });
      expect(section.compareDocumentPosition(article) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it("scrolls a topic opened at a heading hash to that heading", async () => {
    const scrolled: Element[] = [];
    const spy = vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(function (this: Element) {
      scrolled.push(this);
    });
    try {
      renderAt("/topics/rh-08#what-moved-out");
      const heading = await screen.findByRole("heading", { level: 3, name: "What moved out" });
      await waitFor(() => expect(scrolled).toContain(heading));
    } finally {
      spy.mockRestore();
    }
  });
});

describe("Entities list", () => {
  it("filters by text and by type, and says when nothing matches", async () => {
    const { user } = renderAt("/entities");
    const main = within(await screen.findByRole("main"));
    expect(await main.findByRole("link", { name: /^nas-01/ })).toBeInTheDocument();
    expect(main.getByRole("link", { name: /^embed-server/ })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Machine/ }));
    expect(main.getByRole("link", { name: /^nas-01/ })).toBeInTheDocument();
    expect(main.queryByRole("link", { name: /^embed-server/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^All/ }));
    await user.type(screen.getByRole("textbox", { name: "Filter entities" }), "embed");
    expect(main.queryByRole("link", { name: /^nas-01/ })).not.toBeInTheDocument();
    expect(main.getByRole("link", { name: /^embed-server/ })).toBeInTheDocument();

    await user.type(screen.getByRole("textbox", { name: "Filter entities" }), "zzz");
    expect(await screen.findByText(/No entity matches/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear the filter" }));
    await waitFor(() => expect(main.getByRole("link", { name: /^nas-01/ })).toBeInTheDocument());
  });

  it("sorts by the entities with the most sessions", async () => {
    const { user } = renderAt("/entities");
    await within(await screen.findByRole("main")).findByRole("link", { name: /^nas-01/ });
    await user.selectOptions(screen.getByRole("combobox", { name: "Sort" }), "sessions");
    const machines = screen.getByRole("region", { name: "Machine" });
    const titles = within(machines).getAllByRole("link").map((l) => l.textContent ?? "");
    expect(titles[0]).toMatch(/^phildesk/);
  });
});
