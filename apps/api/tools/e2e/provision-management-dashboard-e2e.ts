import { randomBytes } from "node:crypto";

import argon2 from "argon2";
import { Pool } from "pg";

import {
  assertManagementDashboardE2eTarget,
  MANAGEMENT_DASHBOARD_E2E,
} from "./management-dashboard-e2e-config";
import { persistManagementDashboardE2eFixture } from "./management-dashboard-e2e-persistence";

async function hashE2ePassword(password: string): Promise<string> {
  return argon2.hash(password, {
    hashLength: 32,
    memoryCost: 65_536,
    parallelism: 4,
    salt: randomBytes(16),
    timeCost: 3,
    type: argon2.argon2id,
    version: 19,
  });
}

async function main(): Promise<void> {
  const databaseUrl = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("MIGRATION_DATABASE_URL or DATABASE_URL is required.");
  }
  assertManagementDashboardE2eTarget(databaseUrl);
  const password = process.env.E2E_STAFF_PASSWORD;
  if (!password) throw new Error("E2E_STAFF_PASSWORD is required.");
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  try {
    const passwordHash = await hashE2ePassword(password);
    const client = await pool.connect();
    try {
      const current = await client.query<{ name: string }>("SELECT current_database() AS name");
      if (current.rows[0]?.name !== process.env.E2E_APPROVED_DATABASE) {
        throw new Error("Connected database does not match E2E approval.");
      }
      await persistManagementDashboardE2eFixture(client, passwordHash);
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
  process.stdout.write(
    `Management Dashboard E2E fixture ready: ${MANAGEMENT_DASHBOARD_E2E.organizations.a.id}\n`,
  );
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown failure";
  process.stderr.write(`Management Dashboard E2E provisioning failed: ${message}\n`);
  process.exitCode = 1;
});
