import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

import { Client, Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const adminUrl =
  process.env.TEST_DATABASE_URL ??
  process.env.MIGRATION_DATABASE_URL ??
  "postgresql://valet:valet@127.0.0.1:5432/valet";
const suffix = randomUUID().replaceAll("-", "");
const databaseName = `valet_audit_role_${suffix}`;
const runtimeRole = `valet_audit_runtime_${suffix}`;
const runtimePassword = `runtime-${randomUUID()}`;
const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const pnpmExecutable = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

function urlFor(role?: { password: string; username: string }): string {
  const url = new URL(adminUrl);
  url.pathname = `/${databaseName}`;
  if (role !== undefined) {
    url.username = role.username;
    url.password = role.password;
  }
  return url.toString();
}

async function runPnpm(args: string[], environment: NodeJS.ProcessEnv) {
  const npmExecPath = process.env.npm_execpath;
  const command = npmExecPath === undefined ? pnpmExecutable : process.execPath;
  const commandArgs = npmExecPath === undefined ? args : [npmExecPath, ...args];
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      cwd: repositoryRoot,
      env: { ...process.env, ...environment },
      shell: npmExecPath === undefined && process.platform === "win32",
      stdio: "ignore",
      windowsHide: true,
    });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`pnpm failed (${String(code)})`)),
    );
  });
}

async function expectDenied(operation: Promise<unknown>): Promise<void> {
  await expect(operation).rejects.toMatchObject({ code: "42501" });
}

let admin: Pool;
let runtime: Pool;
let userId: string;

beforeAll(async () => {
  const bootstrap = new Client({ connectionString: adminUrl });
  await bootstrap.connect();
  try {
    await bootstrap.query(`CREATE DATABASE "${databaseName}"`);
  } finally {
    await bootstrap.end();
  }
  const migrationUrl = urlFor();
  const runtimeUrl = urlFor({
    password: runtimePassword,
    username: runtimeRole,
  });
  await runPnpm(["--filter", "@valet/database", "migrate:deploy"], {
    DATABASE_URL: migrationUrl,
    MIGRATION_DATABASE_URL: migrationUrl,
    NODE_ENV: "test",
  });
  await runPnpm(["--filter", "@valet/database", "runtime:provision"], {
    DATABASE_URL: runtimeUrl,
    MIGRATION_DATABASE_URL: migrationUrl,
    NODE_ENV: "test",
  });
  admin = new Pool({ connectionString: migrationUrl });
  runtime = new Pool({ connectionString: runtimeUrl });
  userId = randomUUID();
  await admin.query(
    `INSERT INTO users (id, email, password_hash, updated_at)
     VALUES ($1, $2, 'test-hash', transaction_timestamp())`,
    [userId, `${userId}@audit.invalid`],
  );
}, 120_000);

afterAll(async () => {
  await runtime?.end();
  await admin?.end();
  const bootstrap = new Client({ connectionString: adminUrl });
  await bootstrap.connect();
  try {
    await bootstrap.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
    await bootstrap.query(`DROP ROLE IF EXISTS "${runtimeRole}"`);
  } finally {
    await bootstrap.end();
  }
}, 60_000);

describe("MGT-BE-01 runtime account-security audit privileges", () => {
  it("permits INSERT only and denies read/update/delete/truncate", async () => {
    const eventId = randomUUID();
    await expect(
      runtime.query(
        `INSERT INTO account_security_audit_events
           (id, subject_user_id, actor_type, actor_user_id, event_type, occurred_at)
         VALUES ($1, $2, 'USER', $2, 'ACCOUNT_SECURITY_TESTED', now())`,
        [eventId, userId],
      ),
    ).resolves.toMatchObject({ rowCount: 1 });
    await expectDenied(
      runtime.query(
        "SELECT id FROM account_security_audit_events WHERE id=$1",
        [eventId],
      ),
    );
    await expectDenied(
      runtime.query(
        "UPDATE account_security_audit_events SET event_type=event_type WHERE id=$1",
        [eventId],
      ),
    );
    await expectDenied(
      runtime.query("DELETE FROM account_security_audit_events WHERE id=$1", [
        eventId,
      ]),
    );
    await expectDenied(runtime.query("TRUNCATE account_security_audit_events"));
  });

  it("denies PUBLIC mutation and keeps runtime ownership false", async () => {
    const result = await admin.query<{
      owner_safe: boolean;
      public_mutation_denied: boolean;
    }>(
      `SELECT owner.rolname <> $1 AS owner_safe,
              NOT EXISTS (
                SELECT 1 FROM aclexplode(
                  COALESCE(table_record.relacl,
                           acldefault('r', table_record.relowner))
                ) privilege
                WHERE privilege.grantee=0
                  AND privilege.privilege_type IN
                    ('INSERT','UPDATE','DELETE','TRUNCATE')
              ) AS public_mutation_denied
       FROM pg_class table_record
       JOIN pg_roles owner ON owner.oid=table_record.relowner
       WHERE table_record.oid='account_security_audit_events'::regclass`,
      [runtimeRole],
    );
    expect(result.rows[0]).toEqual({
      owner_safe: true,
      public_mutation_denied: true,
    });
  });
});
