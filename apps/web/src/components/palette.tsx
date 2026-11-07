import type { SearchHit } from "@rivethub/contracts";
import { useNavigate } from "@tanstack/react-router";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearch } from "../client/queries";
import { subjectHref } from "../lib/format";
import { setTheme, THEMES } from "../theme";
import { SearchIcon } from "./icons";
import { Modal } from "./modal";
import { cx } from "./ui";

export interface PaletteItem {
  key: string;
  icon: string;
  label: string;
  hint?: string;
  run: () => void;
}

export interface PaletteGroup {
  title: "Go to" | "Do" | "Ask";
  items: PaletteItem[];
}

const PaletteContext = createContext<{ open: () => void } | null>(null);

export function usePalette() {
  const ctx = useContext(PaletteContext);
  if (!ctx) throw new Error("usePalette needs a PaletteProvider");
  return ctx;
}

const icons: Record<SearchHit["subject"]["kind"], string> = { entity: "E", session: "S", topic: "T" };

/** Builds the Go to / Do / Ask groups for a query. Shared by the ⌘K dialog and the phone Search tab. */
export function usePaletteGroups(text: string, onDone: () => void = () => {}): PaletteGroup[] {
  const navigate = useNavigate();
  const query = text.trim();
  const search = useSearch(query);
  return useMemo(() => {
    const go = (to: string) => () => {
      onDone();
      void navigate({ to });
    };
    if (!query) {
      return [
        {
          title: "Go to",
          items: [
            { key: "today", icon: "◷", label: "Today", run: go("/") },
            { key: "review", icon: "⚑", label: "Review", run: go("/review") },
            { key: "topics", icon: "T", label: "Topics", run: go("/topics") },
            { key: "entities", icon: "E", label: "Entities", run: go("/entities") },
            { key: "sessions", icon: "S", label: "Sessions", run: go("/sessions") },
            { key: "settings", icon: "⚙", label: "Settings", run: go("/settings") },
          ],
        },
        {
          title: "Do",
          items: THEMES.map((t) => ({
            key: `theme-${t.id}`,
            icon: "◐",
            label: `Use the ${t.label} theme`,
            hint: t.hint,
            run: () => {
              setTheme(t.id);
              onDone();
            },
          })),
        },
      ];
    }
    const results = search.data;
    const groups: PaletteGroup[] = [];
    if (results?.goTo.length) {
      groups.push({
        title: "Go to",
        items: results.goTo.map((h) => {
          const item: PaletteItem = { key: `${h.subject.kind}:${h.subject.id}`, icon: icons[h.subject.kind], label: h.subject.title, run: go(subjectHref(h.subject)) };
          if (h.context) item.hint = h.context;
          return item;
        }),
      });
    }
    if (results?.actions.length) {
      groups.push({
        title: "Do",
        items: results.actions.map((a) => {
          const item: PaletteItem = { key: `do:${a.id}`, icon: "→", label: a.label, run: a.id.startsWith("/") ? go(a.id) : onDone };
          if (a.hint) item.hint = a.hint;
          return item;
        }),
      });
    }
    groups.push({
      title: "Ask",
      items: [{ key: "ask", icon: "?", label: query.endsWith("?") ? query : `What do we know about ${query}?`, hint: "Search everything in memory", run: go(`/search?q=${encodeURIComponent(query)}`) }],
    });
    return groups;
  }, [query, search.data, navigate, onDone]);
}

export function PaletteList({ groups, active, onHover, idPrefix, large }: { groups: PaletteGroup[]; active: number; onHover?: (i: number) => void; idPrefix: string; large?: boolean }) {
  let i = -1;
  return (
    <div role="listbox" id={`${idPrefix}-list`} aria-label="Results" className="flex flex-col">
      {groups.map((g) => (
        <div key={g.title} role="group" aria-label={g.title} className="flex flex-col p-1.5">
          <span className="px-2.5 pt-1.5 pb-1 text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">{g.title}</span>
          {g.items.map((item) => {
            i += 1;
            const index = i;
            return (
              <div
                key={item.key}
                id={`${idPrefix}-${index}`}
                role="option"
                aria-selected={index === active}
                onMouseMove={() => onHover?.(index)}
                onClick={item.run}
                className={cx("flex cursor-pointer items-center rounded-lg px-2.5", large ? "min-h-14 gap-3 rounded-xl" : "gap-2.5 py-2", index === active && "bg-selected")}
              >
                <span aria-hidden="true" className={cx("flex shrink-0 items-center justify-center bg-card text-muted-foreground", large ? "size-8 rounded-lg text-[13px]" : "size-[22px] rounded-md border border-border text-[11px]")}>
                  {item.icon}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate">{item.label}</span>
                  {item.hint && <span className="truncate text-[12px] text-muted-foreground">{item.hint}</span>}
                </span>
                {index === active && <span aria-hidden="true" className="text-[12px] text-muted-foreground">↵</span>}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function PaletteDialog({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState("");
  const [active, setActive] = useState(0);
  const groups = usePaletteGroups(text, onClose);
  const flat = groups.flatMap((g) => g.items);
  useEffect(() => setActive(0), [text]);

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, flat.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      flat[active]?.run();
    }
  }

  return (
    <Modal label="Command palette" onClose={onClose} placement="top">
      <label className="flex items-center gap-2.5 border-b border-border px-4 py-3.5">
        <SearchIcon className="text-muted-foreground" />
        <span className="sr-only">Search or run a command</span>
        <input
          autoFocus
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-list"
          aria-activedescendant={flat.length ? `palette-${active}` : undefined}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Search, go to, or ask…"
          className="min-w-0 flex-1 border-0 bg-transparent text-[16px] text-foreground outline-none placeholder:text-muted-foreground"
        />
        <kbd>esc</kbd>
      </label>
      <PaletteList groups={groups} active={active} onHover={setActive} idPrefix="palette" />
      <div className="flex gap-3.5 border-t border-border px-4 py-2.5 text-[12px] text-muted-foreground">
        <span><kbd>↑</kbd> <kbd>↓</kbd> move</span>
        <span><kbd>↵</kbd> open</span>
        <span><kbd>esc</kbd> close</span>
      </div>
    </Modal>
  );
}

export function PaletteProvider({ children }: { children: ReactNode }) {
  const [isOpen, setOpen] = useState(false);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const value = useMemo(() => ({ open: () => setOpen(true) }), []);
  return (
    <PaletteContext.Provider value={value}>
      {children}
      {isOpen && <PaletteDialog onClose={() => setOpen(false)} />}
    </PaletteContext.Provider>
  );
}
