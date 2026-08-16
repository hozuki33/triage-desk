import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const action = process.argv[2];
if (!action || !["up", "up-detached", "down"].includes(action)) {
  throw new Error("Usage: docker-db.ts <up|up-detached|down>");
}

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(apiRoot, "..", "..");
const envText = readFileSync(resolve(apiRoot, ".env"), "utf8");
const databaseLine = envText.split(/\r?\n/).find((line) => line.startsWith("DATABASE_URL="));
if (!databaseLine) throw new Error("DATABASE_URL is required in apps/api/.env");
const databaseUrl = databaseLine.slice("DATABASE_URL=".length).trim().replace(/^([\"'])(.*)\1$/, "$2");
const password = new URL(databaseUrl).password;
if (!password) throw new Error("Local DATABASE_URL must contain a password for Docker PostgreSQL");

const args = action === "down"
  ? ["compose", "down"]
  : action === "up-detached"
    ? ["compose", "up", "-d", "--wait", "postgres"]
    : ["compose", "up", "postgres"];
const result = spawnSync("docker", args, {
  cwd: repositoryRoot,
  env: { ...process.env, POSTGRES_PASSWORD: password },
  stdio: "inherit",
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
