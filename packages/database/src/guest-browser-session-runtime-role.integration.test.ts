import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createDisposableDatabase,
  databaseAdminUrl,
  dropDisposableDatabase,
  seedT1Session,
} from "./guest-browser-session-test-fixture.js";

interface PgError extends Error {
  code?: string;
}

interface RatingRow {
  rated_at: Date | null;
  rating: number | null;
  result_code: string;
  valet_session_id: string | null;
}

const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const prismaCli = fileURLToPath(
  new URL("../node_modules/prisma/build/index.js", import.meta.url),
);
const runtimeRole = `valet_t1_runtime_${process.pid}_${Date.now()}`;
const runtimePassword = `runtime-${randomUUID()}`;
const guestToken = "B".repeat(43);
const expiredGuestToken = "E".repeat(43);
const revokedGuestToken = "R".repeat(43);
const enrollmentToken = `vge1.${"N".repeat(43)}`;
const browserToken = `vgb1.${"S".repeat(43)}`;

let databaseName = "";
let migrationUrl = "";
let runtimeUrl = "";
let adminClient: Client;
let runtimeClient: Client;
let browserSessionId = "";

function runDatabaseScript(args: string[], databaseUrl?: string): void {
  execFileSync(process.execPath, args, {
    cwd: packageRoot,
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      MIGRATION_DATABASE_URL: migrationUrl,
      NODE_ENV: "test",
    },
    stdio: "pipe",
  });
}

function makeRuntimeUrl(): string {
  const url = new URL(migrationUrl);
  url.username = runtimeRole;
  url.password = runtimePassword;
  return url.toString();
}

async function expectDenied(operation: Promise<unknown>): Promise<void> {
  try {
    await operation;
  } catch (error) {
    expect((error as PgError).code).toBe("42501");
    return;
  }
  throw new Error("Expected PostgreSQL privilege denial.");
}

async function submitLegacy(token: string, rating: number): Promise<RatingRow> {
  const result = await runtimeClient.query<RatingRow>(
    `SELECT result_code,valet_session_id::text,rating,rated_at
     FROM guest_rating_submit($1,$2)`,
    [token, rating],
  );
  return result.rows[0]!;
}

async function submitBrowser(rating: number): Promise<RatingRow> {
  const result = await runtimeClient.query<RatingRow>(
    `SELECT result_code,valet_session_id::text,rating,rated_at
     FROM guest_browser_rating_submit($1,$2)`,
    [browserToken, rating],
  );
  return result.rows[0]!;
}

beforeAll(async () => {
  const database = await createDisposableDatabase("valet_t1_runtime");
  databaseName = database.databaseName;
  migrationUrl = database.databaseUrl;
  runtimeUrl = makeRuntimeUrl();
  runDatabaseScript([prismaCli, "migrate", "deploy"]);
  runDatabaseScript(["scripts/provision-runtime-role.mjs"], runtimeUrl);
  adminClient = new Client({ connectionString: migrationUrl });
  runtimeClient = new Client({ connectionString: runtimeUrl });
  await adminClient.connect();
  await runtimeClient.connect();
  browserSessionId = (await seedT1Session(adminClient, "browser", guestToken))
    .sessionId;
  await seedT1Session(adminClient, "expired", expiredGuestToken, {
    expiresIn: "-1 hour",
  });
  await seedT1Session(adminClient, "revoked", revokedGuestToken, {
    revoked: true,
  });
  const enrolled = await runtimeClient.query<{ result_code: string }>(
    `SELECT result_code FROM guest_browser_enroll($1,$2)`,
    [enrollmentToken, browserToken],
  );
  expect(enrolled.rows[0]?.result_code).toBe("OK");
  const exchanged = await runtimeClient.query<{
    result_code: string;
    valet_session_id: string | null;
  }>(
    `SELECT result_code,valet_session_id::text
     FROM guest_browser_exchange($1,$2,$3)`,
    [guestToken, enrollmentToken, browserToken],
  );
  expect(exchanged.rows[0]).toEqual({
    result_code: "AUTHORIZED",
    valet_session_id: browserSessionId,
  });
}, 120_000);

afterAll(async () => {
  await runtimeClient?.end();
  await adminClient?.end();
  if (databaseName !== "") await dropDisposableDatabase(databaseName);
  const bootstrap = new Client({ connectionString: databaseAdminUrl });
  await bootstrap.connect();
  try {
    await bootstrap.query(`DROP ROLE IF EXISTS "${runtimeRole}"`);
  } finally {
    await bootstrap.end();
  }
}, 60_000);

describe("DEC-064 T1 runtime database authority", () => {
  it("keeps browser/rating entry points migration-owned and PUBLIC-closed", async () => {
    const result = await adminClient.query<Record<string, boolean | string>>(
      `SELECT function.proname AS name,
              has_function_privilege($1,function.oid,'EXECUTE') AS runtime_allowed,
              function.prosecdef AS security_definer,
              owner.rolname <> $1 AS owner_safe,
              function.proconfig=ARRAY['search_path=pg_catalog, public']::text[] AS search_path_safe,
              NOT EXISTS(
                SELECT 1 FROM aclexplode(COALESCE(function.proacl,acldefault('f',function.proowner))) p
                WHERE p.grantee=0 AND p.privilege_type='EXECUTE'
              ) AS public_denied,
              NOT EXISTS(
                SELECT 1 FROM aclexplode(COALESCE(function.proacl,acldefault('f',function.proowner))) p
                JOIN pg_roles r ON r.oid=p.grantee
                WHERE r.rolname=$1 AND p.privilege_type='EXECUTE' AND p.is_grantable
              ) AS grant_option_denied
       FROM pg_proc function JOIN pg_roles owner ON owner.oid=function.proowner
       WHERE function.oid IN (
         to_regprocedure('public.guest_browser_enroll(text,text)'),
         to_regprocedure('public.guest_browser_exchange(text,text,text)'),
         to_regprocedure('public.guest_browser_resolve(text,boolean)'),
         to_regprocedure('public.guest_browser_end(text)'),
         to_regprocedure('public.guest_browser_bridge_legacy_generation()'),
         to_regprocedure('public.guest_browser_invalidate_on_generation_change()'),
         to_regprocedure('public.guest_browser_rating_submit(text,integer)'),
         to_regprocedure('public.guest_browser_hash_secret(text)'),
         to_regprocedure('public.guest_rating_submit(text,integer)'))
       ORDER BY function.proname`,
      [runtimeRole],
    );
    expect(
      result.rows.map((row) => [
        row.name,
        row.runtime_allowed,
        row.security_definer,
      ]),
    ).toEqual([
      ["guest_browser_bridge_legacy_generation", false, true],
      ["guest_browser_end", true, true],
      ["guest_browser_enroll", true, true],
      ["guest_browser_exchange", true, true],
      ["guest_browser_hash_secret", false, false],
      ["guest_browser_invalidate_on_generation_change", false, true],
      ["guest_browser_rating_submit", true, true],
      ["guest_browser_resolve", true, true],
      ["guest_rating_submit", true, true],
    ]);
    for (const row of result.rows) {
      expect(row.owner_safe).toBe(true);
      expect(row.search_path_safe).toBe(true);
      expect(row.public_denied).toBe(true);
      expect(row.grant_option_denied).toBe(true);
    }
  });

  it("denies ordinary runtime and PUBLIC direct browser/rating table authority", async () => {
    for (const table of [
      "guest_browser_enrollments",
      "guest_browser_sessions",
      "guest_ratings",
    ]) {
      const privileges = await adminClient.query<Record<string, boolean>>(
        `SELECT has_table_privilege($1,$2,'SELECT') AS can_select,
                has_table_privilege($1,$2,'INSERT') AS can_insert,
                has_table_privilege($1,$2,'UPDATE') AS can_update,
                has_table_privilege($1,$2,'DELETE') AS can_delete,
                has_table_privilege($1,$2,'TRUNCATE') AS can_truncate,
                NOT EXISTS(
                  SELECT 1 FROM pg_class c
                  CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) p
                  WHERE c.oid=$2::regclass AND p.grantee=0
                    AND p.privilege_type IN ('SELECT','INSERT','UPDATE','DELETE','TRUNCATE')
                ) AS public_denied`,
        [runtimeRole, table],
      );
      expect(privileges.rows[0]).toEqual({
        can_delete: false,
        can_insert: false,
        can_select: false,
        can_truncate: false,
        can_update: false,
        public_denied: true,
      });
      await expectDenied(runtimeClient.query(`SELECT * FROM ${table} LIMIT 1`));
      await expectDenied(runtimeClient.query(`DELETE FROM ${table}`));
      await expectDenied(runtimeClient.query(`TRUNCATE ${table}`));
    }
    await expectDenied(
      runtimeClient.query(
        `INSERT INTO guest_browser_enrollments(
           enrollment_token_hash,browser_session_token_hash,expires_at)
         VALUES('x','y',clock_timestamp()+interval '1 minute')`,
      ),
    );
    await expectDenied(
      runtimeClient.query(
        `UPDATE guest_browser_sessions SET revoked_at=revoked_at`,
      ),
    );
    await expectDenied(
      runtimeClient.query(
        `INSERT INTO guest_ratings(organization_id,location_id,valet_session_id,rating)
         VALUES($1,$2,$3,4)`,
        [randomUUID(), randomUUID(), browserSessionId],
      ),
    );
    await expectDenied(
      runtimeClient.query(`UPDATE guest_ratings SET rating=rating`),
    );
  });

  it("rejects consumed, revoked, and expired legacy rating bearers", async () => {
    for (const token of [guestToken, revokedGuestToken, expiredGuestToken]) {
      expect(await submitLegacy(token, 4)).toMatchObject({
        result_code: "INVALID_ACCESS",
        valet_session_id: null,
      });
    }
  });

  it("records one browser rating, converges exact retry, and rejects conflict", async () => {
    const first = await submitBrowser(4);
    expect(first).toMatchObject({
      rating: 4,
      result_code: "OK",
      valet_session_id: browserSessionId,
    });
    expect(first.rated_at).toBeInstanceOf(Date);
    const retry = await submitBrowser(4);
    expect(retry).toMatchObject({
      rating: 4,
      result_code: "OK",
      valet_session_id: browserSessionId,
    });
    expect(retry.rated_at?.getTime()).toBe(first.rated_at?.getTime());
    expect(await submitBrowser(5)).toMatchObject({
      rated_at: null,
      rating: null,
      result_code: "CONFLICT",
      valet_session_id: browserSessionId,
    });
    const stored = await adminClient.query<{ count: number; rating: number }>(
      `SELECT count(*)::int AS count,max(rating)::int AS rating
       FROM guest_ratings WHERE valet_session_id=$1`,
      [browserSessionId],
    );
    expect(stored.rows[0]).toEqual({ count: 1, rating: 4 });
  });
});
