import { createServer } from "node:http";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { logError } from "./log.js";
import { devMailer, resendMailer } from "./mail.js";
import { purge } from "./purge.js";
import { migrate } from "./store/migrate.js";
import { PostgresStore } from "./store/postgres.js";

async function main(): Promise<void> {
  process.on("unhandledRejection", logError);
  const config = loadConfig();
  if (config.telemetrySaltGenerated) {
    process.stderr.write(
      JSON.stringify({ ts: new Date().toISOString(), warning: "TELEMETRY_SALT unset, using a per-process salt (dev only)" }) + "\n",
    );
  }
  const store = PostgresStore.connect(config.databaseUrl);
  const applied = await migrate(store.pool, config.telemetrySalt);
  const mailer = config.resendApiKey ? resendMailer(config.resendApiKey, config.emailFrom) : devMailer();

  const server = createServer(createApp({ store, mailer, config }));
  const purgeTimer = setInterval(() => void purge(store, new Date(), config.telemetryRetentionDays).catch(logError), 10 * 60_000);
  purgeTimer.unref();

  server.listen(config.port, config.host, () => {
    const mode = config.resendApiKey ? "resend" : "dev (magic links are logged, no email sent)";
    process.stderr.write(
      `rivethub-cloud listening on ${config.host}:${config.port} mail=${mode} migrations_applied=${applied.length}\n`,
    );
  });

  const shutdown = (signal: string): void => {
    process.stderr.write(`shutting down on ${signal}\n`);
    server.close(() => void store.close().finally(() => process.exit(0)));
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err: unknown) => {
  logError(err);
  process.exit(1);
});
