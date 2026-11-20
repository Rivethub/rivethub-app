import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createMemoryHistory } from "@tanstack/react-router";
import { cleanup, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "../app";
import { createSampleClient } from "../dev/sample-client";

const CONTRACT = "docs/embedding.md";

const PAGES: { path: string; heading: RegExp }[] = [
  { path: "/", heading: /^Today your agents learned/ },
  { path: "/search", heading: /^Search$/ },
  { path: "/sessions", heading: /^Sessions/ },
  { path: "/sessions/s-retention", heading: /Retention to 14 days/ },
  { path: "/topics", heading: /^Topics/ },
  { path: "/topics/rh-08", heading: /rh 0\.8 memory cut/ },
  { path: "/entities", heading: /^Entities/ },
  { path: "/entities/nas-01", heading: /^nas-01/ },
];

const DOC_PATHS = ["`/`", "`/search`", "`/sessions`", "`/sessions/<id>`", "`/topics`", "`/topics/<id>`", "`/entities`", "`/entities/<id>`"];

const SEARCH_VALUES = {
  when: ["today", "yesterday", "last_7d", "last_14d"],
  where: ["messages", "summaries"],
  match: ["words", "fuzzy", "meaning", "pattern"],
} as const;

function open(path: string) {
  const history = createMemoryHistory({ initialEntries: [path] });
  render(<App client={createSampleClient()} history={history} />);
  return history;
}

function deepLinks(): string {
  const candidates = [resolve(process.cwd(), "docs/embedding.md"), resolve(process.cwd(), "../../docs/embedding.md")];
  const file = candidates.find((candidate) => existsSync(candidate));
  if (!file) throw new Error(`${CONTRACT} was not found from ${process.cwd()}`);
  const doc = readFileSync(file, "utf8");
  return doc.split("## Deep links\n")[1]?.split("\n## ")[0] ?? "";
}

describe("host route contract", () => {
  it("names the contract paths in the deep link section", () => {
    const section = deepLinks();
    expect(section, CONTRACT).not.toBe("");
    for (const path of DOC_PATHS) expect(section, CONTRACT).toContain(path);
    for (const name of ["`q`", "`when`", "`where`", "`match`", "`embed`"]) expect(section, CONTRACT).toContain(name);
    for (const name of ["settings", "share", "receive", "welcome"]) expect(section, CONTRACT).toContain(name);
    expect(section, CONTRACT).toContain("A contract path is never removed or repurposed.");
    expect(section, CONTRACT).toContain("A rename keeps the old path as a redirect to the new one.");
  });

  it("opens each contract path on its page and keeps embed=1", async () => {
    for (const page of PAGES) {
      const history = open(`${page.path}?embed=1`);
      const heading = await screen.findByRole("heading", { level: 1, name: page.heading }).catch(() => null);
      expect(heading, `${CONTRACT} does not resolve ${page.path}`).not.toBeNull();
      expect(history.location.pathname, CONTRACT).toBe(page.path);
      expect(new URLSearchParams(history.location.search).get("embed"), CONTRACT).toBe("1");
      expect(document.querySelector("[data-embedded='true']"), CONTRACT).toBeTruthy();
      cleanup();
    }
  });

  it("keeps every search parameter a host may set on /search", async () => {
    const history = open("/search?q=memory&when=today&where=messages&match=words&embed=1");
    expect(await screen.findByRole("heading", { level: 1, name: "Search" }), CONTRACT).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /Search memory/ }), CONTRACT).toHaveValue("memory");
    expect(screen.getByRole("button", { name: "Today", pressed: true }), CONTRACT).toBeInTheDocument();
    expect(screen.getByLabelText("Look in"), CONTRACT).toHaveValue("messages");
    expect(screen.getByLabelText("Match by"), CONTRACT).toHaveValue("words");
    const params = new URLSearchParams(history.location.search);
    expect(history.location.pathname, CONTRACT).toBe("/search");
    expect(params.get("q"), CONTRACT).toBe("memory");
    expect(params.get("when"), CONTRACT).toBe("today");
    expect(params.get("where"), CONTRACT).toBe("messages");
    expect(params.get("match"), CONTRACT).toBe("words");
    expect(params.get("embed"), CONTRACT).toBe("1");
    cleanup();

    for (const [key, values] of Object.entries(SEARCH_VALUES)) {
      for (const value of values) {
        const visit = open(`/search?${key}=${value}&embed=1`);
        expect(await screen.findByRole("heading", { level: 1, name: "Search" }), `${CONTRACT} ${key}=${value}`).toBeInTheDocument();
        const kept = new URLSearchParams(visit.location.search);
        expect(visit.location.pathname, CONTRACT).toBe("/search");
        expect(kept.get(key), CONTRACT).toBe(value);
        expect(kept.get("embed"), CONTRACT).toBe("1");
        cleanup();
      }
    }
  });
});
