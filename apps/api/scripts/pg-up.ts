import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const databaseDir = path.join(root, ".pg-data");

const pg = new EmbeddedPostgres({
  databaseDir,
  user: "postgres",
  password: "triageDesk2026",
  port: 5432,
  persistent: true,
});

if (!existsSync(path.join(databaseDir, "PG_VERSION"))) {
  await pg.initialise();
}

await pg.start();

try {
  await pg.createDatabase("triage_desk");
} catch {
  // already exists
}

console.log("PostgreSQL is up at 127.0.0.1:5432 / triage_desk");
console.log("Keep this terminal open. Ctrl+C stops the database.");

await new Promise(() => {
  /* keep alive */
});
