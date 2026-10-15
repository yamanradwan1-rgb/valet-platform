import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { RaceContext, Scope } from "./issue215-staff-race-context";
import { inPostgresTransaction } from "../src/common/database/postgres-transaction";
import type { PostgresPool } from "../src/common/database/postgres";
import { StaffAuthService } from "../src/modules/auth/staff-auth.service";
import { generateStaffCredential, staffCredentialHash } from "../src/modules/auth/staff-auth-credential";
import { logoutStaffSession } from "../src/modules/auth/staff-auth-logout";
import type { StaffSessionContext } from "../src/modules/auth/staff-session-context";
import { authorizeConditionPhotoScope } from "../src/modules/vehicle-photos/condition-photo-authorization";
import { finalizeConditionPhoto, markConditionPhotoStored, reserveConditionPhoto } from "../src/modules/vehicle-photos/condition-photo-transactions";
type Lease = NonNullable<Awaited<ReturnType<typeof reserveConditionPhoto>>["lease"]>;

const facts = {
  canonicalSha256: Buffer.alloc(32, 0x22),
  byteSize: 256,
  width: 10,
  height: 10,
  objectVersion: null,
};

function barrier() {
  let entered!: () => void;
  let release!: () => void;
  const atBarrier = new Promise<void>((resolve) => { entered = resolve; });
  const resume = new Promise<void>((resolve) => { release = resolve; });
  return { atBarrier, entered, release, resume };
}

/** Pause a REAL auth writer with its SQL locks still held, immediately after its chosen statement. */
function pausedWriter(pool: PostgresPool, statement: RegExp) {
  const gate = barrier();
  let paused = false;
  const wrapper = {
    connect: async () => {
      const client = await pool.connect();
      return {
        query: async (sql: string, values?: unknown[]) => {
          const result = await client.query(sql, values);
          if (!paused && statement.test(sql)) {
            paused = true;
            gate.entered();
            await gate.resume;
          }
          return result;
        },
        release: (destroy?: boolean) => client.release(destroy),
      };
    },
  } as unknown as PostgresPool;
  return { gate, wrapper };
}

async function awaitLockWait(pool: PostgresPool, statement: RegExp): Promise<void> {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    const result = await pool.query<{ query: string }>(
      `SELECT query FROM pg_stat_activity
       WHERE datname = current_database() AND pid <> pg_backend_pid()
         AND wait_event_type = 'Lock'`,
    );
    if (result.rows.some((row) => statement.test(row.query))) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Expected real PostgreSQL lock wait was not observed.");
}

async function createCredential(ctx: RaceContext, scope: Scope) {
  const sessionId = randomUUID();
  const accessToken = generateStaffCredential("vsa1.");
  const refreshToken = generateStaffCredential("vsr1.");
  const inserted = await ctx.pool.query<{ created_at: Date }>(
    `INSERT INTO staff_auth_sessions
       (id,user_id,current_access_token_hash,access_expires_at,
        absolute_expires_at,created_at,last_rotated_at)
     VALUES($1,$2,$3,clock_timestamp()+interval '15 minutes',
            clock_timestamp()+interval '30 days',clock_timestamp(),clock_timestamp())
     RETURNING created_at`,
    [sessionId, scope.userId, staffCredentialHash("access", accessToken)],
  );
  await ctx.pool.query(
    `INSERT INTO staff_refresh_credentials
       (id,session_id,token_hash,generation,created_at,expires_at)
     VALUES($1,$2,$3,1,clock_timestamp(),clock_timestamp()+interval '30 days')`,
    [randomUUID(), sessionId, staffCredentialHash("refresh", refreshToken)],
  );
  const credential: StaffSessionContext = {
    userId: scope.userId,
    staffAuthSessionId: sessionId,
    accessTokenHash: staffCredentialHash("access", accessToken),
    createdAt: inserted.rows[0]!.created_at,
  };
  return { credential, refreshToken };
}

async function storedLease(ctx: RaceContext, scope: Scope, credential: StaffSessionContext) {
  const reservation = await reserveConditionPhoto(
    ctx.pool, credential, scope.sessionId, randomUUID(), Buffer.alloc(32, 0x11), 256, "issue215_test",
  );
  const lease = reservation.lease;
  if (!lease) throw new Error("Expected a fresh T1 lease.");
  await markConditionPhotoStored(ctx.pool, credential, scope.sessionId, lease, facts);
  return lease;
}

async function finalizeInsideLockedTransaction(
  client: PoolClient, scope: Scope, credential: StaffSessionContext, lease: Lease,
): Promise<void> {
  await client.query(
    `SELECT public.condition_photo_finalize_upload($1::uuid,$2::uuid,$3::uuid,
       $4::uuid,$5::uuid,$6::text,$7::bytea,$8::integer,$9::integer,$10::integer)`,
    [credential.userId, scope.memberId, lease.operation_id, lease.attempt_id,
      lease.lease_owner, facts.objectVersion, facts.canonicalSha256,
      facts.byteSize, facts.width, facts.height],
  );
}

async function committedEvidence(ctx: RaceContext, lease: Lease) {
  const result = await ctx.pool.query<{ selected: string; audit_count: string }>(
    `SELECT (SELECT count(*)::text FROM condition_photo_upload_operations
             WHERE id = $1 AND status = 'VERIFIED') AS selected,
            (SELECT count(*)::text FROM audit_events WHERE
             entity_type = 'ValetSession' AND event_type = 'CHECK_IN_CONDITION_PHOTO_VERIFIED'
             AND entity_id = (SELECT valet_session_id FROM condition_photo_upload_operations WHERE id = $1)) AS audit_count`,
    [lease.operation_id],
  );
  return result.rows[0];
}

describe("Issue #283 real StaffAuthSession T1/T2 credential races", () => {
  let ctx: RaceContext;
  let observer: Pool;
  beforeAll(async () => {
    // The guarded P1 fixture is loaded at runtime: API's tsc rootDir excludes
    // packages/database TS source. Its pinned target attestation still runs.
    const fixtureUrl = pathToFileURL(resolve(__dirname,
      "../../../packages/database/src/condition-photo-p1-test-context.ts"));
    const { ConditionPhotoP1TestContext } = await import(/* @vite-ignore */ fixtureUrl.href) as {
      ConditionPhotoP1TestContext: new () => RaceContext;
    };
    ctx = new ConditionPhotoP1TestContext();
    await ctx.start();
    observer = new Pool({ connectionString: ctx.dbUrl, max: 1 });
  }, 180_000);
  afterAll(async () => {
    await observer?.end();
    await ctx?.stop();
  }, 30_000);

  it("refresh commits first: waiting T1 refuses the old access hash and creates no attempt", async () => {
    const scope = await ctx.seed();
    const { credential, refreshToken } = await createCredential(ctx, scope);
    const { gate, wrapper } = pausedWriter(ctx.pool, /UPDATE staff_auth_sessions\s+SET current_access_token_hash/i);
    const auth = new StaffAuthService(wrapper, { verify: async () => false });
    const refresh = auth.refresh(refreshToken);
    await gate.atBarrier;
    try {
      const reserve = reserveConditionPhoto(ctx.pool, credential, scope.sessionId,
        randomUUID(), Buffer.alloc(32, 0x11), 256, "issue215_test");
      const mustReject = expect(reserve).rejects.toBeDefined();
      try {
        await awaitLockWait(observer, /pg_advisory_xact_lock/i);
      } finally { gate.release(); }
      await refresh;
      await mustReject;
      const count = await ctx.pool.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM condition_photo_upload_attempts WHERE valet_session_id=$1",
        [scope.sessionId],
      );
      expect(count.rows[0]?.count).toBe("0");
    } finally { gate.release(); await refresh.catch(() => undefined); }
  }, 30_000);

  it("refresh commits first: waiting T2 cannot qualify STORED bytes with stale access", async () => {
    const scope = await ctx.seed();
    const { credential, refreshToken } = await createCredential(ctx, scope);
    const lease = await storedLease(ctx, scope, credential);
    const { gate, wrapper } = pausedWriter(ctx.pool, /UPDATE staff_auth_sessions\s+SET current_access_token_hash/i);
    const refresh = new StaffAuthService(wrapper, { verify: async () => false }).refresh(refreshToken);
    await gate.atBarrier;
    try {
      const finalize = finalizeConditionPhoto(ctx.pool, credential, scope.sessionId, lease, facts);
      const mustReject = expect(finalize).rejects.toBeDefined();
      try { await awaitLockWait(observer, /pg_advisory_xact_lock/i); }
      finally { gate.release(); }
      const rotated = await refresh;
      await mustReject;
      expect(await committedEvidence(ctx, lease)).toEqual({ selected: "0", audit_count: "0" });
      const current = { ...credential, accessTokenHash: staffCredentialHash("access", rotated.accessToken) };
      await finalizeConditionPhoto(ctx.pool, current, scope.sessionId, lease, facts);
      expect(await committedEvidence(ctx, lease)).toEqual({ selected: "1", audit_count: "1" });
    } finally { gate.release(); await refresh.catch(() => undefined); }
  }, 30_000);

  it("T2 commits first: refresh waits; exactly one photo and audit then old bearer is stale", async () => {
    const scope = await ctx.seed();
    const { credential, refreshToken } = await createCredential(ctx, scope);
    const lease = await storedLease(ctx, scope, credential);
    let refresh!: Promise<unknown>;
    await inPostgresTransaction(ctx.pool, async (client) => {
      await authorizeConditionPhotoScope(client, credential, scope.sessionId);
      refresh = new StaffAuthService(ctx.pool, { verify: async () => false }).refresh(refreshToken);
      await awaitLockWait(observer, /pg_advisory_xact_lock/i);
      await finalizeInsideLockedTransaction(client, scope, credential, lease);
    });
    await refresh;
    expect(await committedEvidence(ctx, lease)).toEqual({ selected: "1", audit_count: "1" });
    await expect(finalizeConditionPhoto(ctx.pool, credential, scope.sessionId, lease, facts))
      .rejects.toBeDefined();
  }, 30_000);

  it("logout locks exact session first: waiting T2 loses and cannot create evidence", async () => {
    const scope = await ctx.seed();
    const { credential, refreshToken } = await createCredential(ctx, scope);
    const lease = await storedLease(ctx, scope, credential);
    const { gate, wrapper } = pausedWriter(ctx.pool, /FOR UPDATE OF refresh, session/i);
    const logout = logoutStaffSession(wrapper, refreshToken);
    await gate.atBarrier;
    try {
      const finalize = finalizeConditionPhoto(ctx.pool, credential, scope.sessionId, lease, facts);
      const mustReject = expect(finalize).rejects.toBeDefined();
      try { await awaitLockWait(observer, /FROM staff_auth_sessions AS session/i); }
      finally { gate.release(); }
      await logout;
      await mustReject;
      expect(await committedEvidence(ctx, lease)).toEqual({ selected: "0", audit_count: "0" });
    } finally { gate.release(); await logout.catch(() => undefined); }
  }, 30_000);

  it("T2 commits first: real logout waits for the exact session row, then revokes", async () => {
    const scope = await ctx.seed();
    const { credential, refreshToken } = await createCredential(ctx, scope);
    const lease = await storedLease(ctx, scope, credential);
    let logout!: Promise<void>;
    await inPostgresTransaction(ctx.pool, async (client) => {
      await authorizeConditionPhotoScope(client, credential, scope.sessionId);
      logout = logoutStaffSession(ctx.pool, refreshToken);
      await awaitLockWait(observer, /FOR UPDATE OF refresh, session/i);
      await finalizeInsideLockedTransaction(client, scope, credential, lease);
    });
    await logout;
    expect(await committedEvidence(ctx, lease)).toEqual({ selected: "1", audit_count: "1" });
    await expect(finalizeConditionPhoto(ctx.pool, credential, scope.sessionId, lease, facts))
      .rejects.toBeDefined();
  }, 30_000);

  it.each(["user", "membership", "location-access"] as const)(
    "%s revocation holds a real row lock: waiting T2 rejects after revoke commits",
    async (which) => {
      const scope = await ctx.seed();
      const { credential } = await createCredential(ctx, scope);
      const lease = await storedLease(ctx, scope, credential);
      const revoker = await ctx.pool.connect();
      let committed = false;
      try {
        await revoker.query("BEGIN");
        await revoker.query("SET LOCAL statement_timeout = '8s'");
        if (which === "user") {
          await revoker.query("UPDATE users SET status='DISABLED' WHERE id=$1", [scope.userId]);
        } else if (which === "membership") {
          await revoker.query(
            "UPDATE organization_memberships SET status='INACTIVE' WHERE id=$1", [scope.memberId],
          );
        } else {
          await revoker.query(
            `DELETE FROM membership_location_access
             WHERE organization_id=$1 AND membership_id=$2 AND location_id=$3`,
            [scope.orgId, scope.memberId, scope.locationId],
          );
        }
        const finalize = finalizeConditionPhoto(ctx.pool, credential, scope.sessionId, lease, facts);
        const mustReject = expect(finalize).rejects.toBeDefined();
        try { await awaitLockWait(observer, /FOR SHARE/i); }
        finally { await revoker.query("COMMIT"); committed = true; }
        await mustReject;
        expect(await committedEvidence(ctx, lease)).toEqual({ selected: "0", audit_count: "0" });
      } finally {
        if (!committed) await revoker.query("ROLLBACK").catch(() => undefined);
        revoker.release();
      }
    },
    30_000,
  );
});
