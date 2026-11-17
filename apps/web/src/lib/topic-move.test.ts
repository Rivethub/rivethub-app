import type { TopicId, TopicNode } from "@rivethub/contracts";
import { describe, expect, it } from "vitest";
import { dropReason, findNode, moveDestinations, relocate, topicPath } from "./topic-move";

const id = (value: string) => value as TopicId;

function leaf(name: string, extra: Partial<TopicNode> = {}): TopicNode {
  return { name, sessionCount: 0, status: "open", children: [], ...extra, id: id(extra.id ?? name.toLowerCase()) };
}

function branch(name: string, children: TopicNode[], extra: Partial<TopicNode> = {}): TopicNode {
  const node = leaf(name, extra);
  node.children = children.map((child) => ({ ...child, parentId: node.id }));
  return node;
}

/**
 * The shape rh's own nesting test uses. Runtime is three deep, Desktop is two.
 * Fresh is a root with nothing under it.
 */
function fixture() {
  const merge = leaf("Merge");
  const topics = branch("Topics", [merge]);
  const runtime = branch("Runtime", [topics]);
  const memory = leaf("Memory");
  const desktop = branch("Desktop", [memory]);
  const fresh = leaf("Fresh");
  return [runtime, desktop, fresh];
}

const me = "phil";

describe("dropReason", () => {
  const tree = fixture();

  it("allows a leaf under a topic that still has room, and a whole branch when the sum stays within four", () => {
    expect(dropReason(tree, "fresh", "merge", me)).toBeNull();
    expect(dropReason(tree, "desktop", "topics", me)).toBeNull();
  });

  it("refuses a drop on itself, on a descendant, on its current parent, and past four levels", () => {
    expect(dropReason(tree, "runtime", "runtime", me)).toBe("self");
    expect(dropReason(tree, "runtime", "merge", me)).toBe("descendant");
    expect(dropReason(tree, "memory", "desktop", me)).toBe("same");
    expect(dropReason(tree, "fresh", null, me)).toBe("same");
    expect(dropReason(tree, "desktop", "merge", me)).toBe("too-deep");
  });

  it("lets a nested topic move to the top level", () => {
    expect(dropReason(tree, "memory", null, me)).toBeNull();
  });

  it("refuses a topic owned by someone else, and allows the signed-in person and a topic with no owner", () => {
    const theirs = [leaf("Notes", { owner: "coco" })];
    expect(dropReason(theirs, "notes", null, me)).toBe("unowned");
    expect(dropReason([leaf("Notes", { owner: "phil" })], "notes", null, me)).toBe("same");
    expect(dropReason([leaf("Notes")], "notes", null, me)).toBe("same");
    expect(dropReason(theirs, "notes", null, undefined)).toBe("same");
  });

  it("reports a topic or a parent that is not in the tree", () => {
    expect(dropReason(tree, "missing", null, me)).toBe("missing");
    expect(dropReason(tree, "fresh", "missing", me)).toBe("missing");
  });
});

describe("relocate", () => {
  it("nests a topic under the new parent and takes its children with it", () => {
    const tree = fixture();
    const next = relocate(tree, "topics", "desktop");
    expect(findNode(next, "topics")?.parent?.id).toBe("desktop");
    expect(findNode(next, "topics")?.node.parentId).toBe("desktop");
    expect(findNode(next, "merge")?.parent?.id).toBe("topics");
    expect(findNode(tree, "topics")?.parent?.id).toBe("runtime");
  });

  it("clears the parent when a topic moves to the top level", () => {
    const next = relocate(fixture(), "memory", null);
    const place = findNode(next, "memory");
    expect(place?.parent).toBeUndefined();
    expect(place?.node.parentId).toBeUndefined();
    expect(next.map((node) => node.id)).toContain("memory");
  });

  it("leaves the tree alone when the topic or the parent is absent", () => {
    const tree = fixture();
    expect(relocate(tree, "missing", null).map((node) => node.id)).toEqual(tree.map((node) => node.id));
    expect(findNode(relocate(tree, "memory", "missing"), "memory")?.parent?.id).toBe("desktop");
  });
});

describe("topicPath", () => {
  it("walks from the root down to the topic", () => {
    expect(topicPath(fixture(), "merge").map((node) => node.name)).toEqual(["Runtime", "Topics", "Merge"]);
    expect(topicPath(fixture(), "fresh").map((node) => node.name)).toEqual(["Fresh"]);
    expect(topicPath(fixture(), "missing")).toEqual([]);
  });
});

describe("moveDestinations", () => {
  it("lists only parents that would be a real move", () => {
    const labels = moveDestinations(fixture(), "memory", me).map((dest) => dest.label);
    expect(labels[0]).toBe("Top level");
    expect(labels).toContain("Runtime › Topics › Merge");
    expect(labels).not.toContain("Desktop");
    expect(labels).not.toContain("Desktop › Memory");
  });

  it("offers nothing when every parent would be illegal or the current one", () => {
    expect(moveDestinations(fixture(), "runtime", me).map((dest) => dest.label)).toEqual(["Desktop", "Fresh"]);
  });
});
