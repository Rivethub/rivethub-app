import { createServer } from "node:http";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { logError } from "./log.js";
import { devMailer, resendMailer } from "./mail.js";
import { migrate } from "./store/migrate.js";
import { PostgresStore } from "./store/postgres.js";

async function main(): Promise<void> {
  process.on("unhandledRejection", logError);
  const config = loadConfig();
  const store = PostgresStore.connect(config.databaseUrl);
  const applied = await migrate(store.pool);
  const mailer = config.resendApiKey ? resendMailer(config.resendApiKey, config.emailFrom) : devMailer();

  const server = createServer(createApp({ store, mailer, config }));
  const purge = setInterval(() => void store.purgeExpired(new Date()).catch(logError), 10 * 60_000);
  purge.unref();

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
