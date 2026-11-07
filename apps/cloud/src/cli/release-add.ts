import { parseArgs } from "node:util";
import { loadConfig } from "../config.js";
import { migrate } from "../store/migrate.js";
import { PostgresStore } from "../store/postgres.js";
import { releaseInput } from "../store/types.js";

const usage =
  "usage: pnpm --filter @rivethub/cloud release:add --channel stable|beta --os <os> --version <x.y.z> --url <https url> --sha256 <hex> --signature <sig> --notes-url <https url>";

const { values } = parseArgs({
  options: {
    channel: { type: "string" },
    os: { type: "string" },
    version: { type: "string" },
    url: { type: "string" },
    sha256: { type: "string" },
    signature: { type: "string" },
    "notes-url": { type: "string" },
  },
});

const parsed = releaseInput.safeParse({
  channel: values.channel,
  os: values.os,
  version: values.version,
  url: values.url,
  sha256: values.sha256,
  signature: values.signature,
  notesUrl: values["notes-url"],
});
if (!parsed.success) {
  process.stderr.write(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n") + `\n${usage}\n`);
  process.exit(2);
}

const store = PostgresStore.connect(loadConfig().databaseUrl);
try {
  await migrate(store.pool);
  await store.addRelease(parsed.data, new Date());
  const r = parsed.data;
  process.stdout.write(`release ${r.version} (${r.channel}, ${r.os}) saved\n`);
} finally {
  await store.close();
}
