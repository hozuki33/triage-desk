import { PrismaClient } from "@prisma/client";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";

const sourceUrl = process.env.DATABASE_URL;
if (!sourceUrl) throw new Error("DATABASE_URL is required");

const databaseName = `triage_desk_test_${randomBytes(6).toString("hex")}`;
const testUrl = new URL(sourceUrl);
testUrl.pathname = `/${databaseName}`;
const adminUrl = new URL(sourceUrl);
adminUrl.pathname = "/postgres";

const admin = new PrismaClient({ datasources: { db: { url: adminUrl.toString() } } });
await admin.$executeRawUnsafe(`CREATE DATABASE "${databaseName}"`);
const testDatabase = new PrismaClient({ datasources: { db: { url: testUrl.toString() } } });
await testDatabase.$executeRawUnsafe("CREATE EXTENSION IF NOT EXISTS vector");
await testDatabase.$executeRawUnsafe("CREATE EXTENSION IF NOT EXISTS pg_trgm");
await testDatabase.$disconnect();

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const binDir = resolve(apiRoot, "node_modules", ".bin");
const environment = {
  ...process.env,
  DATABASE_URL: testUrl.toString(),
  DEEPSEEK_API_KEY: "",
  OPENAI_API_KEY: "",
  EMBEDDING_PROVIDER: "disabled",
  JWT_SECRET: "integration-test-secret",
};

function run(command: string, args: string[]) {
  const result = spawnSync(resolve(binDir, command), args, {
    cwd: apiRoot,
    env: environment,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) throw new Error(`${command} exited with ${result.status ?? 1}`);
}

try {
  run(process.platform === "win32" ? "prisma.cmd" : "prisma", ["db", "push", "--skip-generate"]);
  run(process.platform === "win32" ? "tsx.cmd" : "tsx", ["--test", "src/routes/tickets.integration.test.ts"]);
} finally {
  await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
  await admin.$disconnect();
}
