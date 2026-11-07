import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PaletteList, usePaletteGroups } from "../components/palette";
import { Frame, MainSidebar } from "../components/shell";
import { SampleBadge } from "../components/ui";
import { useIsPhone } from "../lib/media";

const route = getRouteApi("/search");

/** The palette as a page: the phone Search tab, and where "Ask" lands. */
export function SearchPage() {
  const { q = "" } = route.useSearch();
  const navigate = useNavigate();
  const [text, setText] = useState(q);
  const [active, setActive] = useState(0);
  useEffect(() => setText(q), [q]);
  const phone = useIsPhone();
  const groups = usePaletteGroups(text);
  const flat = groups.flatMap((g) => g.items);
  useEffect(() => setActive(0), [text]);
  return (
    <Frame sidebar={<MainSidebar />} tabs>
      <div className="mx-auto flex w-full max-w-[720px] flex-col text-[15px] md:py-8">
        <div className="px-4 pt-4 pb-2">
          <label className="flex min-h-12 items-center gap-2.5 rounded-[14px] border-2 border-primary bg-card px-3.5">
            <span className="sr-only">Search, go to, or ask</span>
            <input
              autoFocus
              role="combobox"
              aria-expanded="true"
              aria-controls="search-list"
              aria-activedescendant={flat.length ? `search-${active}` : undefined}
              value={text}
              placeholder="Search, go to, or ask"
              onChange={(e) => {
                setText(e.target.value);
                void navigate({ to: "/search", search: e.target.value ? { q: e.target.value } : {}, replace: true });
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") setActive((a) => Math.min(a + 1, flat.length - 1));
                else if (e.key === "ArrowUp") setActive((a) => Math.max(a - 1, 0));
                else if (e.key === "Enter") flat[active]?.run();
                else return;
                e.preventDefault();
              }}
              className="min-w-0 flex-1 border-0 bg-transparent text-[17px] text-foreground outline-none placeholder:text-muted-foreground"
            />
            {text && (
              <button type="button" aria-label="Clear" onClick={() => setText("")} className="size-8 text-muted-foreground">✕</button>
            )}
          </label>
          <div className="pt-2"><SampleBadge capability="search" /></div>
        </div>
        <div className="px-2">
          <PaletteList groups={groups} active={active} onHover={setActive} idPrefix="search" large={phone} />
        </div>
      </div>
    </Frame>
  );
}
