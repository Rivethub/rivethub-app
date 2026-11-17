import { count, readableName } from "@rivethub/client-runtime/format";
import type { ModelJob, WorkerId } from "@rivethub/contracts";

/**
 * Stats names a worker; `/api/memory/models` names the role that does that work.
 * "Wiki builder" is `wiki-writer` on the route.
 */
export const STATS_WORKER_ROLE: Record<WorkerId, string> = {
  embedder: "embedder",
  summarizer: "summarizer",
  categorizer: "categorizer",
  "wiki-builder": "wiki-writer",
};

const ROLE_NAME: Record<string, string> = {
  default: "Default",
  summarizer: "Summarizer",
  categorizer: "Categorizer",
  "wiki-writer": "Wiki writer",
  embedder: "Embedder",
};

export interface MemoryRoleReading {
  name: string;
  /** Provider and model, "Default · …" only when the role inherits one, or "No model set". */
  modelLine: string;
  state: string;
  waiting: number;
  /** A Today clause. Empty when this role is not a problem. */
  problem: string;
  outage?: string;
}

const NO_MODEL = "No model set";

function roleName(role: string): string {
  return ROLE_NAME[role] ?? readableName(role);
}

function joined(parts: Array<string | undefined>): string {
  return parts.map((part) => part?.trim()).filter((part): part is string => !!part).join(" · ");
}

function modelLineOf(job: ModelJob, roles: readonly ModelJob[]): string {
  if (job.health === "unconfigured") return NO_MODEL;
  const own = joined([job.provider, job.model]);
  // An older hub marks the embedder as inheriting and also sends its own endpoint.
  if (job.role === "embedder" || !job.inheritsDefault) return own || NO_MODEL;
  const fallback = roles.find((role) => role.role === "default");
  const inherited = [fallback?.provider, fallback?.model].map((part) => part?.trim()).filter((part): part is string => !!part).join(" ");
  return inherited ? `Default · ${inherited}` : NO_MODEL;
}

function stateOf(job: ModelJob, modelLine: string): string {
  if (job.health === "not-running") return "Not running";
  if (job.health === "failing") return "Failing";
  if (job.health === "slow") return "Slow";
  if (job.health === "unconfigured" || modelLine === NO_MODEL) return "No model set";
  if (job.health === "healthy") return "Running";
  return readableName(job.health);
}

function problemOf(job: ModelJob, name: string, waiting: number): string {
  const who = name.toLowerCase();
  if (job.health === "unconfigured") return "";
  if (job.health === "not-running") return waiting > 0 ? `the ${who} is not running, with ${count(waiting)} waiting` : "";
  if (job.health === "failing") return `the ${who} model is failing`;
  if (job.health === "slow" && waiting > 0) return `the ${who} is behind, with ${count(waiting)} waiting`;
  return "";
}

/** What a person reads for one role from `GET /api/memory/models`. */
export function describeMemoryRole(job: ModelJob, roles: readonly ModelJob[]): MemoryRoleReading {
  const name = roleName(job.role);
  const modelLine = modelLineOf(job, roles);
  const outage = job.outage?.trim() || undefined;
  return {
    name,
    modelLine,
    state: stateOf(job, modelLine),
    waiting: job.queued,
    problem: problemOf(job, name, job.queued),
    ...(outage ? { outage } : {}),
  };
}

/** State, how many jobs are waiting, and the outage, in one line. */
export function memoryRoleStatus(reading: MemoryRoleReading): string {
  return [reading.state, `${count(reading.waiting)} waiting`, reading.outage].filter(Boolean).join(" · ");
}
