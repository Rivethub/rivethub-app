import { describe, expect, it } from "vitest";
import type { EntityId, ReviewItemId, SessionId, TopicId } from "@rivethub/contracts";
import { createSampleClient } from "../src/sample/client.js";
import { NotFoundError } from "../src/errors.js";

const nas = "nas-01" as EntityId;
const retention = "claude-code:retention" as SessionId;

describe("the sample world", () => {
  it("reports every capability as sample", async () => {
    const caps = await createSampleClient().capabilities();
    expect(Object.values(caps).every((value) => value === "sample")).toBe(true);
    expect(Object.keys(caps)).toHaveLength(12);
  });

  it("has one coherent topic tree with counts that roll up", async () => {
    const tree = await createSampleClient().topicTree();
    const rivethub = tree.find((node) => node.name === "RivetHub")!;
    expect(rivethub.children.map((node) => node.name)).toEqual(expect.arrayContaining(["rh runtime", "Desktop app", "Plug-ins"]));
    const runtime = rivethub.children.find((node) => node.name === "rh runtime")!;
    expect(runtime.children.map((node) => node.name)).toEqual(["rh 0.8 memory cut", "Capture hooks"]);
    expect(rivethub.sessionCount).toBeGreaterThanOrEqual(runtime.sessionCount);
    const lab = tree.find((node) => node.name === "Home lab")!;
    expect(lab.children.map((node) => node.name)).toEqual(["Backups", "Postgres"]);
  });

  it("covers every review group, harness state, job health and hub kind the design shows", async () => {
    const client = createSampleClient();
    const groups = new Set((await client.reviewQueue()).map((item) => item.group));
    expect(groups).toEqual(new Set(["conflict", "fact", "new-entity", "filing", "tag", "tidy"]));
    expect((await client.harnesses()).find((h) => h.id === "codex")?.capture.state).toBe("stale");
    const jobs = await client.modelJobs();
    expect(jobs.find((job) => job.role === "categorizer")).toMatchObject({ health: "slow", queued: 12 });
    expect((await client.hubs()).map((hub) => [hub.name, hub.kind, hub.online])).toEqual([
      ["workstation", "local", true],
      ["household", "team", true],
      ["lab-server", "team", false],
    ]);
  });
});

describe("review", () => {
  it("removes a decided item and leaves the others", async () => {
    const client = createSampleClient();
    const before = await client.reviewQueue();
    const target = before.find((item) => item.group === "tidy")!;
    await client.decide(target.id, { kind: "reject" });
    const after = await client.reviewQueue();
    expect(after).toHaveLength(before.length - 1);
    expect(after.some((item) => item.id === target.id)).toBe(false);
    expect((await client.today()).reviewCount).toBe(after.length);
  });

  it("rejects an unknown item", async () => {
    await expect(createSampleClient().decide("nope" as ReviewItemId, { kind: "accept" })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("choosing a conflict option sets the fact and clears the conflict", async () => {
    const client = createSampleClient();
    const item = (await client.reviewQueue()).find((candidate) => candidate.group === "conflict")!;
    expect(item.options?.map((option) => option.value)).toEqual(["03:00 nightly", "02:30 nightly"]);
    await client.decide(item.id, { kind: "choose", value: "02:30 nightly" });
    const fact = (await client.entity(nas)).facts.find((f) => f.key === "Backup time")!;
    expect(fact.value).toBe("02:30 nightly");
    expect(fact.conflict).toBeUndefined();
    expect(fact.previous?.value).toBe("03:00 nightly");
  });

  it("accepting a filing item files the session under the suggested topic", async () => {
    const client = createSampleClient();
    const item = (await client.reviewQueue()).find((candidate) => candidate.group === "filing" && candidate.subject.title.startsWith("Sketch"))!;
    await client.decide(item.id, { kind: "accept" });
    const row = (await client.sessions({ text: "Sketch" })).items[0]!;
    expect(row.topic?.path).toEqual(["RivetHub", "Desktop app"]);
  });

  it("accepting a new-entity item creates the entity", async () => {
    const client = createSampleClient();
    const item = (await client.reviewQueue()).find((candidate) => candidate.group === "new-entity")!;
    await client.decide(item.id, { kind: "accept" });
    const titles = (await client.entities()).map((entity) => entity.title);
    expect(titles).toContain(item.subject.title);
  });

  it("an accepted fact lands on its entity and Today's needs-you list shrinks", async () => {
    const client = createSampleClient();
    const item = (await client.reviewQueue()).find((candidate) => candidate.subject.title === "workstation")!;
    await client.decide(item.id, { kind: "accept" });
    expect((await client.entity("workstation" as EntityId)).facts.find((f) => f.key === "GPU")?.value).toBe("24 GB");
    const today = await client.today();
    expect(today.needsYou.length).toBeLessThanOrEqual(3);
    expect(today.needsYou[0]!.group).toBe("conflict");
  });
});

describe("entities", () => {
  it("shows nas-01 with a conflict, a retention change and a pinned fact", async () => {
    const article = await createSampleClient().entity(nas);
    const byKey = new Map(article.facts.map((fact) => [fact.key, fact]));
    expect(byKey.get("Backup time")?.conflict?.candidates.map((c) => c.value)).toEqual(["03:00 nightly", "02:30 nightly"]);
    expect(byKey.get("Retention")).toMatchObject({ value: "14 days", previous: { value: "7 days" } });
    expect(byKey.get("Disks")).toMatchObject({ value: "Two, mirrored", pinned: true });
    expect(article.sessionCount).toBe(article.sessions.length);
    expect(article.sessionCount).toBeGreaterThanOrEqual(3);
  });

  it("setFact pins an existing fact without changing its value", async () => {
    const client = createSampleClient();
    const status = (await client.entity(nas)).facts.find((fact) => fact.key === "Status")!;
    expect(status.pinned).toBe(false);
    await client.setFact(nas, { id: status.id, key: status.key, value: status.value, pinned: true });
    const after = (await client.entity(nas)).facts.find((fact) => fact.id === status.id)!;
    expect(after).toMatchObject({ pinned: true, value: "Online" });
    expect(after.previous).toBeUndefined();
  });

  it("setFact with a new value keeps the old one as previous and adds a new fact when no id matches", async () => {
    const client = createSampleClient();
    const retentionFact = (await client.entity(nas)).facts.find((fact) => fact.key === "Retention")!;
    await client.setFact(nas, { id: retentionFact.id, key: "Retention", value: "30 days", pinned: false });
    await client.setFact(nas, { key: "Location", value: "Garage shelf", pinned: true });
    const article = await client.entity(nas);
    expect(article.facts.find((fact) => fact.id === retentionFact.id)).toMatchObject({ value: "30 days", previous: { value: "14 days" } });
    expect(article.facts.find((fact) => fact.key === "Location")).toMatchObject({ value: "Garage shelf", pinned: true });
    expect(article.timeline[0]!.text).toContain("Location");
  });

  it("answers as of a past time with the value from then", async () => {
    const client = createSampleClient();
    const past = await client.entity(nas, "2026-11-01T12:00:00.000Z" as never);
    expect(past.facts.find((fact) => fact.key === "Retention")?.value).toBe("7 days");
    expect(past.facts.find((fact) => fact.key === "Disks")).toBeUndefined();
    expect(past.timeline.every((entry) => entry.at <= "2026-11-01T12:00:00.000Z")).toBe(true);
  });

  it("filters by type", async () => {
    const machines = await createSampleClient().entities("machine");
    expect(machines.map((entity) => entity.title).sort()).toEqual(["nas-01", "workstation"]);
    await expect(createSampleClient().entity("nope" as EntityId)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("refuses a fact on an unknown entity", async () => {
    await expect(createSampleClient().setFact("nope" as EntityId, { key: "a", value: "b", pinned: false })).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("sessions", () => {
  it("trash moves sessions into the trash view and out of all", async () => {
    const client = createSampleClient();
    await client.trash([retention]);
    expect((await client.sessions({})).items.some((row) => row.id === retention)).toBe(false);
    const trash = (await client.sessions({ view: "trash" })).items;
    expect(trash.find((row) => row.id === retention)).toMatchObject({ trashed: true, kept: false });
    expect(trash.some((row) => row.title === "test")).toBe(true);
  });

  it("keep restores a trashed session and marks it kept", async () => {
    const client = createSampleClient();
    await client.trash([retention]);
    await client.keep(retention, true);
    expect((await client.sessions({ view: "kept" })).items.map((row) => row.id)).toContain(retention);
    expect((await client.sessions({ view: "trash" })).items.some((row) => row.id === retention)).toBe(false);
  });

  it("unfiled shows the sessions Review wants to file, and placing one removes it", async () => {
    const client = createSampleClient();
    const unfiled = (await client.sessions({ view: "unfiled" })).items;
    expect(unfiled).toHaveLength(4);
    await client.placeSession(unfiled[0]!.id, "t-home-lab" as TopicId);
    expect((await client.sessions({ view: "unfiled" })).items).toHaveLength(3);
    await client.placeSession(unfiled[0]!.id, null);
    expect((await client.sessions({ view: "unfiled" })).items).toHaveLength(4);
  });

  it("filters by topic including its subtopics, by harness and by text", async () => {
    const client = createSampleClient();
    const lab = (await client.sessions({ topic: "t-home-lab" as TopicId })).items;
    expect(lab.length).toBeGreaterThanOrEqual(4);
    expect(lab.every((row) => row.topic?.path[0] === "Home lab")).toBe(true);
    expect((await client.sessions({ harness: "codex" })).items.every((row) => row.harness === "codex")).toBe(true);
    expect((await client.sessions({ text: "retention" })).items.map((row) => row.title)).toEqual(["Retention to 14 days"]);
  });

  it("spans claude-code, codex, grok-build, cursor and opencode", async () => {
    const harnesses = new Set((await createSampleClient().sessions({})).items.map((row) => row.harness));
    expect(harnesses).toEqual(new Set(["claude-code", "codex", "grok-build", "cursor", "opencode"]));
  });

  it("gives the retention session a root, branch and leaf summary tree and a transcript to match", async () => {
    const client = createSampleClient();
    const tree = await client.summaryTree(retention);
    expect(tree.level).toBe("root");
    if (tree.level !== "root") throw new Error("Expected a legacy root");
    expect(tree.children.map((branch) => [branch.level, branch.title, branch.messageRange])).toEqual([
      ["branch", "Checking headroom", [0, 21]],
      ["branch", "Changing retention", [22, 47]],
      ["branch", "Confirming the next run", [48, 63]],
    ]);
    expect(tree.children[1]!.children.every((leaf) => leaf.level === "leaf")).toBe(true);
    const detail = await client.session(retention);
    const turns = await client.transcript(retention);
    expect(turns).toHaveLength(detail.messageCount);
    expect((await client.transcript(retention, [22, 24])).map((turn) => turn.index)).toEqual([22, 23, 24]);
  });

  it("rename, visibility and tag operations update the session", async () => {
    const client = createSampleClient();
    await client.renameSession(retention, "Retention, 14 days");
    await client.setVisibility(retention, { kind: "space", space: "household" });
    await client.tag(retention, "topic", "backups", "add");
    await client.tag(retention, "topic", "disk", "add");
    await client.tag(retention, "topic", "disk", "remove");
    const detail = await client.session(retention);
    expect(detail.title).toBe("Retention, 14 days");
    expect(detail.visibility).toEqual({ kind: "space", space: "household" });
    expect(detail.tags).toEqual([{ key: "topic", value: "backups", state: "applied" }]);
    await expect(client.renameSession(retention, "  ")).rejects.toThrow();
  });

  it("accepts a suggested tag and drops a rejected one", async () => {
    const client = createSampleClient();
    const spike = "opencode:cache-spike" as SessionId;
    await client.tag(spike, "project", "cache", "accept");
    expect((await client.session(spike)).tags).toEqual([{ key: "project", value: "cache", state: "applied" }]);
    await client.tag(spike, "project", "cache", "reject");
    expect((await client.session(spike)).tags).toEqual([]);
  });

  it("returns copies, so a caller cannot edit the world by mutating a result", async () => {
    const client = createSampleClient();
    const first = await client.session(retention);
    first.title = "mutated";
    expect((await client.session(retention)).title).toBe("Retention to 14 days");
  });
});

describe("topics", () => {
  it("builds an article with decisions newest first, and addDecision prepends", async () => {
    const client = createSampleClient();
    const id = "t-rh-08" as TopicId;
    const before = await client.topic(id);
    expect(before.path.map((step) => step.name)).toEqual(["RivetHub", "rh runtime", "rh 0.8 memory cut"]);
    expect(before.decisions.at(-1)).toMatchObject({ superseded: true, text: "Keep the plug-in host for 0.8." });
    await client.addDecision(id, "Ship 0.8 behind a flag.");
    const after = await client.topic(id);
    expect(after.decisions[0]!.text).toBe("Ship 0.8 behind a flag.");
    expect(after.decisions).toHaveLength(before.decisions.length + 1);
  });

  it("updateTopic renames, reparents and refuses to move a topic inside itself", async () => {
    const client = createSampleClient();
    await client.updateTopic("t-capture-hooks" as TopicId, { name: "Hooks", parentId: "t-rivethub" as TopicId, aliases: ["capture"], folder: null });
    const moved = await client.topic("t-capture-hooks" as TopicId);
    expect(moved).toMatchObject({ name: "Hooks", aliases: ["capture"] });
    expect(moved.path.map((step) => step.name)).toEqual(["RivetHub", "Hooks"]);
    await expect(client.updateTopic("t-rivethub" as TopicId, { parentId: "t-rh-runtime" as TopicId })).rejects.toThrow(/inside itself/);
  });
});

describe("search and settings", () => {
  it("finds a topic, an entity by fact value and a session", async () => {
    const client = createSampleClient();
    const hits = (await client.search("retention")).goTo;
    expect(hits.map((hit) => hit.subject.kind)).toEqual(expect.arrayContaining(["entity", "session"]));
    expect((await client.search("homelab")).goTo[0]!.subject).toMatchObject({ kind: "topic", title: "Home lab" });
    expect((await client.search("two, mirrored")).goTo[0]!.subject).toMatchObject({ kind: "entity", title: "nas-01" });
    expect((await client.search("zzzz-none")).goTo).toEqual([]);
  });

  it("connecting the Codex hook turns it from stale to receiving and returns a diff and backup", async () => {
    const client = createSampleClient();
    const result = await client.connectHarness("codex", "capture");
    expect(result.diff).toContain("+[hooks.rivethub]");
    expect(result.backupPath).toMatch(/backup$/);
    expect((await client.harnesses()).find((h) => h.id === "codex")?.capture.state).toBe("receiving");
    await expect(client.connectHarness("claude-code", "capture")).rejects.toThrow();
  });

  it("updateAccount changes only the fields given", async () => {
    const client = createSampleClient();
    await client.updateAccount({ channel: "beta", crashReports: false });
    expect(await client.account()).toMatchObject({ channel: "beta", crashReports: false, usageCounts: true, version: "0.8.0" });
  });

  it("Today lists the day's sessions with their changes and a heat map ending today", async () => {
    const today = await createSampleClient().today();
    expect(today.date).toBe("2026-11-06");
    expect(today.entries.map((entry) => entry.session.title)).toEqual(["Wire the memory change stream", "Why the codex hook stopped posting", "Untangle session visibility"]);
    expect(today.entries[0]!.changes.map((change) => change.kind)).toEqual(["decision", "new"]);
    expect(today.activityByDay.at(-1)!.date).toBe("2026-11-06");
    expect(today.reviewCount).toBe(14);
  });
});
