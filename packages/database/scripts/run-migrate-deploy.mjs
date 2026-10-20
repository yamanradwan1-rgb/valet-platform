import "dotenv/config";

import { spawn } from "node:child_process";
import process from "node:process";

import pg from "pg";

import {
  migrationClientConfig,
  parseMigrationDatabaseUrl,
  verifyMigrationConnectionTls,
} from "./database-connection-policy.mjs";

const { Client } = pg;

async function preflight() {
  const migration = parseMigrationDatabaseUrl(
    process.env.MIGRATION_DATABASE_URL,
    process.env.NODE_ENV,
  );
  if (process.env.NODE_ENV !== "production") return;
  const client = new Client(
    migrationClientConfig(migration, process.env.NODE_ENV),
  );
  try {
    await client.connect();
    await verifyMigrationConnectionTls(client, process.env.NODE_ENV);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Production migration")) {
      throw error;
    }
    throw new Error("Production migration TLS preflight could not connect securely.");
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function runPrismaMigration() {
  const pnpmPath = process.env.npm_execpath;
  if (pnpmPath === undefined || pnpmPath.trim() === "") {
    throw new Error("Migration execution requires the pnpm workspace runtime.");
  }
  const code = await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [pnpmPath, "exec", "prisma", "migrate", "deploy"],
      { env: process.env, stdio: "inherit", windowsHide: true },
    );
    child.on("error", reject);
    child.on("close", resolve);
  });
  if (code !== 0) {
    throw new Error("Prisma migration deployment failed.");
  }
}

await preflight();
await runPrismaMigration();
