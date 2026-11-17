import { keys } from "@rivethub/client-runtime/query-keys";
import type { TopicId, TopicNode } from "@rivethub/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useMemo, useState, type DragEvent, type HTMLAttributes, type ReactNode } from "react";
import { useUpdateTopic, useMe, useTopicTree } from "../client/queries";
import { canDrop, dropReason, findNode, moveDestinations, relocate, topicIsMovable } from "../lib/topic-move";
import { Modal } from "./modal";
import { cx } from "./ui";

/**
 * Chromium leaves `dataTransfer` empty until the drop, so the id has to live here for the
 * drag-over check. The mime type is what a drop from this app carries.
 */
const TOPIC_DRAG = "application/x-rivethub-topic";

type Hover = { kind: "root" } | { kind: "topic"; id: string } | null;
type Dragging = { id: TopicId; name: string };

type TopicDragApi = {
  dragging: Dragging | null;
  hover: Hover;
  reveal: { id: string; n: number } | null;
  notice: string | null;
  begin: (id: TopicId, name: string) => void;
  end: () => void;
  mark: (hover: Hover) => void;
  move: (id: TopicId, parentId: TopicId | null, me: string | undefined) => void;
};

const TopicDragContext = createContext<TopicDragApi | null>(null);

function useTopicDrag(): TopicDragApi {
  const api = useContext(TopicDragContext);
  if (!api) throw new Error("topic drag needs TopicDragProvider");
  return api;
}

export function TopicDragProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const { mutate } = useUpdateTopic();
  const [dragging, setDragging] = useState<Dragging | null>(null);
  const [hover, setHover] = useState<Hover>(null);
  const [reveal, setReveal] = useState<{ id: string; n: number } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const mark = useCallback((next: Hover) => {
    setHover((prev) => {
      if (prev === next) return prev;
      if (prev?.kind === "root" && next?.kind === "root") return prev;
      if (prev?.kind === "topic" && next?.kind === "topic" && prev.id === next.id) return prev;
      return next;
    });
  }, []);

  const begin = useCallback((id: TopicId, name: string) => {
    setNotice(null);
    setDragging({ id, name });
  }, []);

  const end = useCallback(() => {
    setDragging(null);
    setHover(null);
  }, []);

  const move = useCallback(
    (id: TopicId, parentId: TopicId | null, me: string | undefined) => {
      const tree = qc.getQueryData<TopicNode[]>(keys.topicTree) ?? [];
      if (dropReason(tree, id, parentId, me) !== null) return;
      // The move re-mounts the dragged row, so its `dragend` may never reach React.
      setDragging(null);
      setHover(null);
      const name = findNode(tree, id)?.node.name ?? "Topic";
      const previous = tree;
      qc.setQueryData(keys.topicTree, relocate(tree, id, parentId));
      if (parentId) setReveal((prev) => ({ id: parentId, n: (prev?.n ?? 0) + 1 }));
      setNotice(null);
      mutate(
        { id, patch: { parentId } },
        {
          onError: () => {
            qc.setQueryData(keys.topicTree, previous);
            setNotice(`${name} stayed where it was.`);
          },
        },
      );
    },
    [qc, mutate],
  );

  const api = useMemo<TopicDragApi>(
    () => ({ dragging, hover, reveal, notice, begin, end, mark, move }),
    [dragging, hover, reveal, notice, begin, end, mark, move],
  );

  return (
    <TopicDragContext.Provider value={api}>
      {children}
      {notice && (
        <p role="status" className="fixed bottom-4 left-1/2 z-50 max-w-md -translate-x-1/2 rounded-lg border border-error bg-card px-3 py-2 text-[13px] text-error shadow-[0_12px_32px_rgba(0,0,0,.35)]">
          {notice}
        </p>
      )}
    </TopicDragContext.Provider>
  );
}

type ItemProps = {
  id: TopicId;
  name: string;
  owner?: string;
  tree: readonly TopicNode[];
  me: string | undefined;
  as?: "div" | "li";
  className?: string;
  children: ReactNode;
} & Omit<HTMLAttributes<HTMLElement>, "id" | "className" | "children" | "draggable">;

export function TopicDragItem({ as: Tag = "div", id, name, owner, tree, me, className, children, ...rest }: ItemProps) {
  const drag = useTopicDrag();
  const movable = topicIsMovable(owner, me);
  const draggingThis = drag.dragging?.id === id;
  const hovered = drag.hover?.kind === "topic" && drag.hover.id === id;
  const reason = drag.dragging && hovered ? dropReason(tree, drag.dragging.id, id, me) : null;
  const valid = hovered && reason === null;
  const illegal = hovered && reason !== null && reason !== "same";

  function onDragStart(e: DragEvent) {
    if (!movable || !e.dataTransfer) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData(TOPIC_DRAG, id);
    e.dataTransfer.effectAllowed = "move";
    drag.begin(id, name);
  }

  function onDragOver(e: DragEvent) {
    if (!drag.dragging) return;
    const block = dropReason(tree, drag.dragging.id, id, me);
    drag.mark({ kind: "topic", id });
    if (block !== null) {
      if (e.dataTransfer) e.dataTransfer.dropEffect = "none";
      return;
    }
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
  }

  function onDragLeave(e: DragEvent) {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    if (drag.hover?.kind === "topic" && drag.hover.id === id) drag.mark(null);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    const source = drag.dragging?.id;
    drag.mark(null);
    if (source) drag.move(source, id, me);
  }

  return (
    <Tag
      {...rest}
      draggable={movable}
      aria-grabbed={draggingThis || undefined}
      data-drop={valid ? "valid" : illegal ? "invalid" : hovered && reason === "same" ? "same" : undefined}
      onDragStart={onDragStart}
      onDragEnd={() => drag.end()}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={cx("relative", className, draggingThis && "opacity-50 outline outline-2 outline-dashed outline-primary", valid && "bg-selected ring-2 ring-primary", illegal && "ring-2 ring-error")}
    >
      {children}
      {valid && <span className="pointer-events-none absolute top-1/2 right-1.5 -translate-y-1/2 rounded bg-selected px-1 text-[11px] font-medium text-primary">Nest here</span>}
      {illegal && <span className="pointer-events-none absolute top-1/2 right-1.5 -translate-y-1/2 rounded bg-card px-1 text-[11px] text-error">Can't drop</span>}
    </Tag>
  );
}

/** Shown only while a topic is in the air. Already-root topics read as not a drop. */
export function TopLevelDrop({ tree, me, className }: { tree: readonly TopicNode[]; me: string | undefined; className?: string }) {
  const drag = useTopicDrag();
  if (!drag.dragging) return null;
  const reason = dropReason(tree, drag.dragging.id, null, me);
  const hovered = drag.hover?.kind === "root";
  const valid = hovered && reason === null;
  const blocked = reason !== null;
  const text = reason === "same" ? "Already at the top level" : reason === null ? "Drop here for the top level" : "Can't drop at the top level";
  return (
    <div
      aria-label="Top level"
      data-drop={valid ? "valid" : hovered && blocked ? "invalid" : undefined}
      onDragOver={(e) => {
        drag.mark({ kind: "root" });
        if (reason !== null) {
          if (e.dataTransfer) e.dataTransfer.dropEffect = "none";
          return;
        }
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        if (drag.hover?.kind === "root") drag.mark(null);
      }}
      onDrop={(e) => {
        e.preventDefault();
        const source = drag.dragging?.id;
        drag.mark(null);
        if (source) drag.move(source, null, me);
      }}
      className={cx(
        "rounded-md border border-dashed px-2 py-1.5 text-[12px]",
        valid && "border-primary bg-selected text-foreground ring-2 ring-primary",
        hovered && blocked && "border-error text-error ring-2 ring-error",
        !hovered && "border-input text-muted-foreground",
        className,
      )}
    >
      {text}
    </div>
  );
}

export function MoveTopicButton({ id, name, owner, quiet }: { id: TopicId; name: string; owner?: string; quiet?: boolean }) {
  const me = useMe().data?.user;
  const [open, setOpen] = useState(false);
  if (!topicIsMovable(owner, me)) return null;
  return (
    <>
      <button
        type="button"
        aria-label={`Move ${name} to…`}
        onClick={() => setOpen(true)}
        onDragStart={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        className={cx(
          "shrink-0 rounded-md px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground",
          quiet && "opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100",
        )}
      >
        Move to…
      </button>
      {open && <MoveDialog id={id} name={name} onClose={() => setOpen(false)} />}
    </>
  );
}

function MoveDialog({ id, name, onClose }: { id: TopicId; name: string; onClose: () => void }) {
  const drag = useTopicDrag();
  const tree = useTopicTree().data ?? [];
  const me = useMe().data?.user;
  const [filter, setFilter] = useState("");
  const destinations = moveDestinations(tree, id, me);
  const needle = filter.trim().toLowerCase();
  const shown = needle === "" ? destinations : destinations.filter((dest) => dest.label.toLowerCase().includes(needle));
  const choose = (parentId: TopicId | null) => {
    drag.move(id, parentId, me);
    onClose();
  };
  return (
    <Modal label={`Move ${name} to…`} onClose={onClose}>
      <div className="flex flex-col gap-3 p-4">
        <h2 className="m-0 text-[16px] font-semibold">Move {name} to…</h2>
        {destinations.length === 0 ? (
          <p className="m-0 text-[13px] text-muted-foreground">This topic can't move anywhere else.</p>
        ) : (
          <>
            <input
              autoFocus
              aria-label="Filter topics"
              placeholder="Filter topics"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="rounded-lg border border-input bg-background px-2.5 py-1.5 text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
            />
            <div className="flex max-h-[50vh] flex-col gap-0.5 overflow-auto">
              {shown.map((dest) => (
                <button
                  key={dest.parentId ?? "top"}
                  type="button"
                  onClick={() => choose(dest.parentId)}
                  className="rounded-lg px-2.5 py-1.5 text-left text-[13px] hover:bg-accent"
                >
                  {dest.label}
                </button>
              ))}
              {shown.length === 0 && <p className="m-0 px-2 py-1 text-[13px] text-muted-foreground">No topic matches.</p>}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

/** The parent a move just landed under, so a collapsed tree can open it. `n` changes on every landing. */
export function useLandedParent(): { id: string; n: number } | null {
  return useTopicDrag().reveal;
}