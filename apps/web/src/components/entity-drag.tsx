import { keys } from "@rivethub/client-runtime/query-keys";
import type { EntityArticle, EntityCategory, EntitySummary } from "@rivethub/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useId, useRef, useState, type DragEvent, type ReactNode } from "react";
import { useClient } from "../client/context";
import { cx } from "./ui";

const ENTITY_DRAG = "application/x-rivethub-entity";

interface EntityMove {
  entity: EntitySummary;
  category: EntityCategory;
}

interface EntityDrag {
  dragging: EntitySummary | null;
  hover: string | null;
  pending: boolean;
  begin: (entity: EntitySummary) => void;
  end: () => void;
  setHover: (id: string | null) => void;
  move: (entity: EntitySummary, category: EntityCategory) => void;
}

const EntityDragContext = createContext<EntityDrag | null>(null);

export function useEntityDrag() {
  const drag = useContext(EntityDragContext);
  if (!drag) throw new Error("entity drag needs EntityDragProvider");
  return drag;
}

export function EntityDragProvider({ children }: { children: ReactNode }) {
  const client = useClient();
  const qc = useQueryClient();
  const [dragging, setDragging] = useState<EntitySummary | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const moving = useRef(false);

  const write = useMutation({
    mutationFn: ({ entity, category }: EntityMove) => client.moveEntity!(entity.id, category.id),
    onMutate: async ({ entity, category }) => {
      const listKey = keys.entities();
      const articleKey = ["entity", entity.id];
      await Promise.all([listKey, articleKey, keys.entityTypes].map((queryKey) => qc.cancelQueries({ queryKey })));
      const list = qc.getQueryData<EntitySummary[]>(listKey);
      const articles = qc.getQueriesData<EntityArticle>({ queryKey: articleKey });
      const categories = qc.getQueryData<EntityCategory[]>(keys.entityTypes);
      const change = { type: category.type, typeName: category.typeName };
      if (list) qc.setQueryData(listKey, list.map((item) => item.id === entity.id ? { ...item, ...change } : item));
      for (const [key, article] of articles) {
        if (article) qc.setQueryData(key, { ...article, ...change });
      }
      if (categories) qc.setQueryData(keys.entityTypes, categories.map((item) =>
        item.id === category.id ? { ...item, count: item.count + 1 } :
          item.type === entity.type ? { ...item, count: Math.max(0, item.count - 1) } : item,
      ));
      return { list, articles, categories };
    },
    onError: (_error, { entity }, previous) => {
      if (previous?.list) qc.setQueryData(keys.entities(), previous.list);
      if (previous?.categories) qc.setQueryData(keys.entityTypes, previous.categories);
      for (const [key, article] of previous?.articles ?? []) qc.setQueryData(key, article);
      setNotice(`${entity.title} stayed where it was.`);
    },
    onSettled: async (_result, error, { entity }) => {
      const affected = [["entities"], ["entity", entity.id], keys.entityTypes];
      if (!error) affected.push(["search"]);
      await Promise.all(affected.map((queryKey) => qc.invalidateQueries({ queryKey })));
      moving.current = false;
    },
  });

  function end() {
    setDragging(null);
    setHover(null);
  }

  const drag: EntityDrag = {
    dragging,
    hover,
    pending: write.isPending,
    begin(entity) {
      setNotice(null);
      setDragging(entity);
    },
    end,
    setHover,
    move(entity, category) {
      if (moving.current || !client.moveEntity || entity.type === category.type) return;
      moving.current = true;
      // The row can unmount on the optimistic move before its dragend reaches React.
      end();
      setNotice(null);
      write.mutate({ entity, category });
    },
  };

  return (
    <EntityDragContext.Provider value={drag}>
      {children}
      {notice && (
        <p role="status" className="fixed bottom-4 left-1/2 z-50 w-max max-w-[min(90vw,28rem)] -translate-x-1/2 rounded-lg border border-error bg-card px-3 py-2 text-[13px] text-error shadow-[0_12px_32px_rgba(0,0,0,.35)]">
          {notice}
        </p>
      )}
    </EntityDragContext.Provider>
  );
}

export function useEntityDragItem(entity: EntitySummary, enabled: boolean, className: string) {
  const drag = useEntityDrag();
  const grabbed = drag.dragging?.id === entity.id;
  const draggable = enabled && !drag.pending;

  return {
    draggable,
    "aria-grabbed": grabbed || undefined,
    className: cx(className, grabbed && "relative opacity-50 outline outline-2 outline-dashed outline-primary"),
    onDragStart(e: DragEvent) {
      if (!draggable || !e.dataTransfer) {
        e.preventDefault();
        return;
      }
      e.dataTransfer.setData(ENTITY_DRAG, entity.id);
      e.dataTransfer.effectAllowed = "move";
      drag.begin(entity);
    },
    onDragEnd: drag.end,
  };
}

export function EntityDropTarget({ as: Tag = "div", type, category, label, className, children }: {
  as?: "div" | "section";
  type: string;
  category: EntityCategory | undefined;
  label?: string;
  className?: string;
  children: ReactNode;
}) {
  const drag = useEntityDrag();
  const id = useId();
  const source = drag.dragging;
  const state = !source ? undefined : source.type === type ? "same" : category ? "valid" : "invalid";
  const valid = state === "valid";
  const hovered = drag.hover === id;
  return (
    <Tag
      id={Tag === "section" ? type : undefined}
      aria-label={label}
      data-drop={state}
      className={cx(
        className,
        source && "relative rounded-lg ring-1 ring-inset",
        valid && (hovered ? "bg-selected ring-2 ring-primary" : "ring-primary/55"),
        state && !valid && "ring-error",
      )}
      onDragOver={(e) => {
        if (!source) return;
        drag.setHover(id);
        if (e.dataTransfer) e.dataTransfer.dropEffect = valid ? "move" : "none";
        if (valid) e.preventDefault();
      }}
      onDragLeave={(e) => {
        if (hovered && !(e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget))) drag.setHover(null);
      }}
      onDrop={(e) => {
        if (!source) return;
        e.preventDefault();
        if (valid && category && e.dataTransfer?.getData(ENTITY_DRAG) === source.id) drag.move(source, category);
      }}
    >
      {children}
      {state && (
        <span className={cx("pointer-events-none absolute right-1.5 rounded px-1 text-[11px]", Tag === "section" ? "top-4" : "top-1/2 -translate-y-1/2", valid ? "bg-selected text-primary" : "bg-card text-error")}>
          {valid ? "Drop here" : state === "same" ? "Already here" : "Can't drop"}
        </span>
      )}
    </Tag>
  );
}
