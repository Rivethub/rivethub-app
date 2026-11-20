import type { ModelJob } from "@rivethub/contracts";
import { describe, expect, it } from "vitest";
import { describeMemoryRole, memoryRoleStatus, STATS_WORKER_ROLE } from "./memoryRole";

function role(partial: Partial<ModelJob> & Pick<ModelJob, "role">): ModelJob {
  return { inheritsDefault: false, health: "healthy", detail: "", queued: 0, ...partial };
}

const chatDefault = role({ role: "default", provider: "claude-cli", model: "opus" });

describe("describeMemoryRole", () => {
  it("names a running worker by the model it reports, not the chat default", () => {
    const job = role({ role: "summarizer", provider: "gpubox", model: "thinkingcap-flash-next", queued: 0 });
    const reading = describeMemoryRole(job, [chatDefault, job]);
    expect(reading).toMatchObject({ name: "Summarizer", modelLine: "gpubox · thinkingcap-flash-next", state: "Running", waiting: 0, problem: "" });
    expect(reading.modelLine).not.toMatch(/Default/);
    expect(memoryRoleStatus(reading)).toBe("Running · 0 waiting");
  });

  it("shows an outage and the jobs waiting on a worker that is failing", () => {
    const job = role({ role: "categorizer", provider: "gpubox", model: "thinkingcap-flash-next", health: "failing", queued: 1628, outage: "the worker stopped claiming" });
    const reading = describeMemoryRole(job, [job]);
    expect(reading).toMatchObject({ state: "Failing", waiting: 1628, outage: "the worker stopped claiming", problem: "the categorizer model is failing" });
    expect(memoryRoleStatus(reading)).toBe("Failing · 1,628 waiting · the worker stopped claiming");
  });

  it("says a role nobody is running has no model, and is a problem only while jobs wait", () => {
    const idle = role({ role: "wiki-writer", health: "not-running", queued: 0 });
    const backedUp = role({ role: "categorizer", health: "not-running", queued: 1628 });
    expect(describeMemoryRole(idle, [chatDefault, idle])).toMatchObject({
      name: "Wiki writer", modelLine: "No model set", state: "Not running", waiting: 0, problem: "",
    });
    expect(describeMemoryRole(backedUp, [backedUp]).problem).toBe("the categorizer is not running, with 1,628 waiting");
    expect(describeMemoryRole(idle, [idle]).modelLine).not.toMatch(/Default|opus/);
  });

  it("shows the embedder's own model and never the chat default", () => {
    const reported = role({ role: "embedder", provider: "http://192.0.2.12:9402", model: "nemotron-embed-8b" });
    expect(describeMemoryRole(reported, [chatDefault, reported]).modelLine).toBe("http://192.0.2.12:9402 · nemotron-embed-8b");
    const olderHub = role({ role: "embedder", provider: "http://192.0.2.12:9402", model: "nemotron-embed-8b", inheritsDefault: true });
    expect(describeMemoryRole(olderHub, [chatDefault, olderHub]).modelLine).not.toMatch(/Default/);
  });

  it("does not call an unconfigured role a problem, even when jobs are waiting", () => {
    const job = role({ role: "summarizer", provider: "claude-cli", model: "opus", inheritsDefault: true, health: "unconfigured", queued: 9 });
    const reading = describeMemoryRole(job, [chatDefault, job]);
    expect(reading).toMatchObject({ modelLine: "No model set", state: "No model set", waiting: 9, problem: "" });
    expect(reading.modelLine).not.toMatch(/Default|opus/);
  });

  it("reads an older hub that copies the chat default onto a role", () => {
    const summarizer = role({ role: "summarizer", provider: "claude-cli", model: "opus", inheritsDefault: true, queued: 16 });
    const wiki = role({ role: "wiki-writer", provider: "claude-cli", model: "opus", inheritsDefault: true, health: "slow", queued: 0 });
    const roles = [chatDefault, summarizer, wiki];
    expect(describeMemoryRole(summarizer, roles)).toMatchObject({ modelLine: "Default · claude-cli opus", state: "Running", problem: "" });
    expect(describeMemoryRole(wiki, roles)).toMatchObject({ modelLine: "Default · claude-cli opus", state: "Slow", problem: "" });
  });

  it("says no model is set when a role inherits a default that has none", () => {
    const job = role({ role: "summarizer", inheritsDefault: true });
    expect(describeMemoryRole(job, [role({ role: "default" }), job]).modelLine).toBe("No model set");
  });

  it("matches a stats worker to its route role by a table", () => {
    expect(STATS_WORKER_ROLE["wiki-builder"]).toBe("wiki-writer");
    expect(STATS_WORKER_ROLE.summarizer).toBe("summarizer");
    expect(STATS_WORKER_ROLE.categorizer).toBe("categorizer");
    expect(STATS_WORKER_ROLE.embedder).toBe("embedder");
  });
});
