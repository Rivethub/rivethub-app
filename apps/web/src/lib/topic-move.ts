import type { TopicId, TopicNode } from "@rivethub/contracts";

/**
 * rh's `check_parent` refuses a nest when the parent's depth plus the moved topic's height
 * passes this. A root's depth is 1. A leaf's height is 1. Four levels stand; a fifth does not.
 */
export const MAX_TOPIC_DEPTH = 4;

export type DropReason = "unowned" | "self" | "descendant" | "same" | "too-deep" | "missing";

export type TopicPlace = { node: TopicNode; parent?: TopicNode };

const byRecency = (a: TopicNode, b: TopicNode) =>
  (b.lastActivity ?? "").localeCompare(a.lastActivity ?? "") || a.name.localeCompare(b.name);

/** A topic with no owner, or owned by the signed-in person, can move. Unknown `me` stays movable; the hub still refuses. */
export function topicIsMovable(owner: string | undefined, me: string | undefined): boolean {
  return owner === undefined || me === undefined || owner === me;
}

/** Root first, the topic last. Empty when `id` is not in the tree. */
export function topicPath(roots: readonly TopicNode[], id: string): TopicNode[] {
  const walk = (nodes: readonly TopicNode[], trail: TopicNode[]): TopicNode[] | undefined => {
    for (const node of nodes) {
      const next = [...trail, node];
      if (node.id === id) return next;
      const hit = walk(node.children, next);
      if (hit) return hit;
    }
    return undefined;
  };
  return walk(roots, []) ?? [];
}

export function findNode(roots: readonly TopicNode[], id: string): TopicPlace | undefined {
  const walk = (nodes: readonly TopicNode[], parent?: TopicNode): TopicPlace | undefined => {
    for (const node of nodes) {
      if (node.id === id) return parent ? { node, parent } : { node };
      const hit = walk(node.children, node);
      if (hit) return hit;
    }
    return undefined;
  };
  return walk(roots);
}

function height(node: TopicNode): number {
  let below = 0;
  for (const child of node.children) below = Math.max(below, height(child));
  return below + 1;
}

function holds(node: TopicNode, id: string): boolean {
  for (const child of node.children) {
    if (child.id === id || holds(child, id)) return true;
  }
  return false;
}

function depthOf(roots: readonly TopicNode[], id: string): number | undefined {
  const walk = (nodes: readonly TopicNode[], depth: number): number | undefined => {
    for (const node of nodes) {
      if (node.id === id) return depth;
      const hit = walk(node.children, depth + 1);
      if (hit !== undefined) return hit;
    }
    return undefined;
  };
  return walk(roots, 1);
}

/**
 * Why `topicId` may not land under `parentId` (`null` is the top level).
 * `null` means the drop is a real move.
 */
export function dropReason(
  roots: readonly TopicNode[],
  topicId: string,
  parentId: string | null,
  me: string | undefined,
): DropReason | null {
  const place = findNode(roots, topicId);
  if (!place) return "missing";
  if (!topicIsMovable(place.node.owner, me)) return "unowned";
  const current = place.node.parentId ?? null;
  if (parentId === current) return "same";
  if (parentId === null) return null;
  if (parentId === topicId) return "self";
  if (holds(place.node, parentId)) return "descendant";
  const parentDepth = depthOf(roots, parentId);
  if (parentDepth === undefined) return "missing";
  if (parentDepth + height(place.node) > MAX_TOPIC_DEPTH) return "too-deep";
  return null;
}

export function canDrop(
  roots: readonly TopicNode[],
  topicId: string,
  parentId: string | null,
  me: string | undefined,
): boolean {
  return dropReason(roots, topicId, parentId, me) === null;
}

export type MoveDestination = { parentId: TopicId | null; label: string };

/** Parents the topic may move under, top level first. The current parent is left out. */
export function moveDestinations(roots: readonly TopicNode[], topicId: string, me: string | undefined): MoveDestination[] {
  const out: MoveDestination[] = [];
  if (canDrop(roots, topicId, null, me)) out.push({ parentId: null, label: "Top level" });
  const walk = (nodes: readonly TopicNode[], trail: string[]) => {
    for (const node of nodes) {
      const label = [...trail, node.name].join(" › ");
      if (canDrop(roots, topicId, node.id, me)) out.push({ parentId: node.id, label });
      walk(node.children, [...trail, node.name]);
    }
  };
  walk(roots, []);
  return out;
}

function withParent(node: TopicNode, parentId: string | null): TopicNode {
  if (parentId === null) {
    const { parentId: _drop, ...rest } = node;
    return rest;
  }
  return { ...node, parentId: parentId as TopicId };
}

/** The tree with `topicId` under `parentId`. The input is left as it was. */
export function relocate(roots: readonly TopicNode[], topicId: string, parentId: string | null): TopicNode[] {
  if (parentId !== null && !findNode(roots, parentId)) return [...roots];
  let moved: TopicNode | undefined;
  const remove = (nodes: readonly TopicNode[]): TopicNode[] => {
    let changed = false;
    const next: TopicNode[] = [];
    for (const node of nodes) {
      if (node.id === topicId) {
        moved = node;
        changed = true;
        continue;
      }
      const children = remove(node.children);
      if (children !== node.children) {
        changed = true;
        next.push({ ...node, children });
      } else next.push(node);
    }
    return changed ? next : (nodes as TopicNode[]);
  };
  const stripped = remove(roots);
  if (!moved) return [...roots];
  const placed = withParent(moved, parentId);
  if (parentId === null) return [...stripped, placed].sort(byRecency);
  const insert = (nodes: readonly TopicNode[]): TopicNode[] => {
    let changed = false;
    const next = nodes.map((node) => {
      if (node.id === parentId) {
        changed = true;
        return { ...node, children: [...node.children, placed].sort(byRecency) };
      }
      const children = insert(node.children);
      if (children === node.children) return node;
      changed = true;
      return { ...node, children };
    });
    return changed ? next : (nodes as TopicNode[]);
  };
  return insert(stripped);
}
