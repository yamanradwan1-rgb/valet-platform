import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createDisposableDatabase,
  databaseAdminUrl,
  dropDisposableDatabase,
} from "./guest-browser-session-test-fixture.js";

const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const prismaCli = fileURLToPath(
  new URL("../node_modules/prisma/build/index.js", import.meta.url),
);
const suffix = `${process.pid}_${Date.now()}`;
const apiRole = `valet_gpush_api_${suffix}`;
const workerRole = `valet_gpush_worker_${suffix}`;
const apiPassword = `api-${randomUUID()}`;
const workerPassword = `worker-${randomUUID()}`;

let databaseName = "";
let migrationUrl = "";
let adminClient: Client;

function roleUrl(role: string, password: string): string {
  const value = new URL(migrationUrl);
  value.username = role;
  value.password = password;
  return value.toString();
}

function runScript(args: string[], env: Record<string, string>): void {
  execFileSync(process.execPath, args, {
    cwd: packageRoot,
    env: { ...process.env, ...env, NODE_ENV: "test" },
    stdio: "pipe",
  });
}

async function functionAllowed(role: string, signature: string): Promise<boolean> {
  const result = await adminClient.query<{ allowed: boolean }>(
    `SELECT has_function_privilege($1,$2,'EXECUTE') AS allowed`,
    [role, signature],
  );
  return result.rows[0]?.allowed === true;
}

async function tableAllowed(
  role: string,
  table: string,
  privilege: string,
): Promise<boolean> {
  const result = await adminClient.query<{ allowed: boolean }>(
    `SELECT has_table_privilege($1,$2,$3) AS allowed`,
    [role, table, privilege],
  );
  return result.rows[0]?.allowed === true;
}

beforeAll(async () => {
  const database = await createDisposableDatabase("valet_guest_push_roles");
  databaseName = database.databaseName;
  migrationUrl = database.databaseUrl;
  runScript([prismaCli, "migrate", "deploy"], {
    MIGRATION_DATABASE_URL: migrationUrl,
  });

  adminClient = new Client({ connectionString: migrationUrl });
  await adminClient.connect();
  await adminClient.query(
    `CREATE ROLE "${workerRole}" WITH LOGIN PASSWORD '${workerPassword}'
       NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`,
  );

  runScript(["scripts/provision-runtime-role.mjs"], {
    DATABASE_URL: roleUrl(apiRole, apiPassword),
    MIGRATION_DATABASE_URL: migrationUrl,
  });
  runScript(["scripts/provision-guest-push-worker-role.mjs"], {
    DATABASE_URL: roleUrl(apiRole, apiPassword),
    GUEST_PUSH_WORKER_DATABASE_URL: roleUrl(workerRole, workerPassword),
    GUEST_PUSH_WORKER_ROLE: workerRole,
    MIGRATION_DATABASE_URL: migrationUrl,
  });
}, 120_000);

afterAll(async () => {
  if (adminClient !== undefined) await adminClient.end();
  if (databaseName !== "") await dropDisposableDatabase(databaseName);
  const bootstrap = new Client({ connectionString: databaseAdminUrl });
  await bootstrap.connect();
  try {
    await bootstrap.query(`DROP ROLE IF EXISTS "${apiRole}"`);
    await bootstrap.query(`DROP ROLE IF EXISTS "${workerRole}"`);
  } finally {
    await bootstrap.end();
  }
});

describe("Guest Push API and sender database role separation", () => {
  it("denies the ordinary API runtime all Guest Push table access", async () => {
    for (const table of [
      "guest_push_registrations",
      "guest_push_intents",
      "guest_push_deliveries",
    ]) {
      expect(await tableAllowed(apiRole, table, "SELECT")).toBe(false);
      expect(await tableAllowed(apiRole, table, "UPDATE")).toBe(false);
    }
    expect(await functionAllowed(
      apiRole,
      "guest_push_resolve_eligible_v1(uuid,uuid,integer)",
    )).toBe(false);
    expect(await functionAllowed(apiRole, "cleanup_guest_push_v1()"))
      .toBe(false);
  });

  it("gives API only registration and READY intent functions", async () => {
    expect(await functionAllowed(
      apiRole,
      "guest_push_register_v1(text,text,text,text,text)",
    )).toBe(true);
    expect(await functionAllowed(
      apiRole,
      "guest_push_ready_intent_v1(uuid,uuid,uuid,timestamp with time zone)",
    )).toBe(true);
  });

  it("gives worker sender authority but no API registration authority", async () => {
    expect(await tableAllowed(workerRole, "guest_push_deliveries", "SELECT"))
      .toBe(true);
    expect(await functionAllowed(
      workerRole,
      "guest_push_resolve_eligible_v1(uuid,uuid,integer)",
    )).toBe(true);
    expect(await functionAllowed(workerRole, "cleanup_guest_push_v1()"))
      .toBe(true);
    expect(await functionAllowed(
      workerRole,
      "guest_push_register_v1(text,text,text,text,text)",
    )).toBe(false);
    expect(await functionAllowed(
      workerRole,
      "guest_push_ready_intent_v1(uuid,uuid,uuid,timestamp with time zone)",
    )).toBe(false);
  });

  it("prevents worker scans of raw PushSubscription material", async () => {
    for (const column of ["endpoint", "p256dh", "auth_secret", "endpoint_hash"]) {
      const result = await adminClient.query<{ allowed: boolean }>(
        `SELECT has_column_privilege(
           $1,'guest_push_registrations',$2,'SELECT'
         ) AS allowed`,
        [workerRole, column],
      );
      expect(result.rows[0]?.allowed).toBe(false);
    }
  });
});
