import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  PUBLIC_URL: z.string().url().default("https://rivethub.cloud"),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().min(1).default("RivetHub <hello@rivethub.cloud>"),
  PORT: z.coerce.number().int().min(0).max(65535).default(8080),
  HOST: z.string().min(1).default("127.0.0.1"),
  TRUST_PROXY: z.enum(["0", "1"]).default("0"),
});

export interface Config {
  databaseUrl: string;
  publicUrl: string;
  resendApiKey: string | undefined;
  emailFrom: string;
  port: number;
  host: string;
  trustProxy: boolean;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const blanked = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined && v !== ""));
  const e = schema.parse(blanked);
  return {
    databaseUrl: e.DATABASE_URL,
    publicUrl: e.PUBLIC_URL.replace(/\/+$/, ""),
    resendApiKey: e.RESEND_API_KEY,
    emailFrom: e.EMAIL_FROM,
    port: e.PORT,
    host: e.HOST,
    trustProxy: e.TRUST_PROXY === "1",
  };
}
