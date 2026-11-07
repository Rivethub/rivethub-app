import { randomBytes } from "node:crypto";
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  PUBLIC_URL: z.string().url().default("https://rivethub.cloud"),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().min(1).default("RivetHub <hello@rivethub.cloud>"),
  PORT: z.coerce.number().int().min(0).max(65535).default(8080),
  HOST: z.string().min(1).default("127.0.0.1"),
  TRUST_PROXY: z.enum(["0", "1"]).default("0"),
  TELEMETRY_SALT: z.string().min(16).optional(),
  TELEMETRY_RETENTION_DAYS: z.coerce.number().int().min(1).max(3650).default(90),
  NODE_ENV: z.string().optional(),
});

export interface Config {
  databaseUrl: string;
  publicUrl: string;
  resendApiKey: string | undefined;
  emailFrom: string;
  port: number;
  host: string;
  trustProxy: boolean;
  telemetrySalt: string;
  telemetrySaltGenerated: boolean;
  telemetryRetentionDays: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const blanked = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined && v !== ""));
  const e = schema.parse(blanked);
  const production = e.NODE_ENV === "production" || e.RESEND_API_KEY !== undefined;
  if (production && !e.TELEMETRY_SALT) {
    throw new Error("TELEMETRY_SALT is required in production (NODE_ENV=production or RESEND_API_KEY set)");
  }
  return {
    databaseUrl: e.DATABASE_URL,
    publicUrl: e.PUBLIC_URL.replace(/\/+$/, ""),
    resendApiKey: e.RESEND_API_KEY,
    emailFrom: e.EMAIL_FROM,
    port: e.PORT,
    host: e.HOST,
    trustProxy: e.TRUST_PROXY === "1",
    telemetrySalt: e.TELEMETRY_SALT ?? randomBytes(32).toString("hex"),
    telemetrySaltGenerated: e.TELEMETRY_SALT === undefined,
    telemetryRetentionDays: e.TELEMETRY_RETENTION_DAYS,
  };
}
