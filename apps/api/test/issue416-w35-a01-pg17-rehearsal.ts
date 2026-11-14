/**
 * Manual W35 synthetic-only PG17 attestation. Requires exclusive disposable
 * w35 database on 127.0.0.1:51135 and an explicit opt-in environment URL.
 * Uses a role-changing test adapter because migration139 deliberately does
 * NOT grant A01 functions to normal runtime. Not a production login rehearsal.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool, type PoolClient, type QueryResult } from "pg";
import type { ApiRequest } from "../src/common/http/api-request";
import type { PostgresPool } from "../src/common/database/postgres";
import { AntiAbuseKeyDeriver } from "../src/modules/anti-abuse/anti-abuse-key";
import { TrustedClientAddressResolver } from "../src/modules/anti-abuse/client-address";
import { StaffAuthenticationError } from "../src/modules/auth/staff-auth-types";
import { hashStaffPassword } from "../src/modules/auth/staff-password-hashing";
import { Issue416A01ProtectedLogin } from "../src/modules/auth/vap1/issue416-a01-protected-login";
import { Issue416A01RequestFingerprint } from "../src/modules/auth/vap1/issue416-a01-request-fingerprint";
import { reconcileA01UnknownCommit } from "../src/modules/auth/vap1/issue416-a01-unknown-commit";

const address = process.env.ISSUE416_W35_PG17_URL;
if (typeof address !== "string") throw new Error("W35 PG17 explicit URL absent");
const parsed = new URL(address);
if (
  parsed.hostname !== "127.0.0.1" || parsed.port !== "51135" ||
  parsed.pathname !== "/issue416_w35_db" ||
  parsed.username !== "issue416_w35_migration"
) throw new Error("Refuse non-W35 PG17 fixture target");
const fixtureName = "issue416_w35_db";
const audience = "w35-local-a01";
const keyId = "w35-key";
const rawPassword = "W35 synthetic Argon2 presented password";
const rootKey = Buffer.from(Array.from({ length: 32 }, (_, i) => i + 1));
const antiAbuseRoot = Buffer.from(Array.from({ length: 32 }, (_, i) => i + 51));
const request = { socket: { remoteAddress: "192.0.2.41" } } as ApiRequest;
process.env.VAYLET_AUTH_PROOF_AUDIENCE = audience;
process.env.ANTI_ABUSE_HMAC_SECRET_B64URL = antiAbuseRoot.toString("base64url");
process.env.VAYLET_AUTH_PROOF_KEYRING_JSON = JSON.stringify([{
  keyId, audience, keyB64url: rootKey.toString("base64url"),
}]);
delete process.env.ANTI_ABUSE_TRUSTED_PROXY_CIDRS;

const adminAddress = new URL(address);
adminAddress.username = "issue416_w35_owner";
const admin = new Pool({ connectionString: adminAddress.toString(), max: 2 });
const app = new Pool({ connectionString: address, max: 3 });
let simulateLostCommit = false;
const selected = {
  async connect(): Promise<PoolClient> {
    const client = await app.connect();
    await client.query("SET ROLE vap1_proof_owner");
    let executed = false;
    const nativeQuery = client.query.bind(client);
    const wrapper = {
      query: async (sql: string, params?: unknown[]) => {
        if (sql.includes("auth_proof_private.a01_execute(")) executed = true;
        const result = await nativeQuery(sql, params);
        if (sql === "COMMIT" && executed && simulateLostCommit) {
          simulateLostCommit = false;
          throw new Error("W35 fixture: simulated COMMIT acknowledgment loss");
        }
        return result;
      },
      release: (destroy?: boolean) => client.release(destroy),
    };
    return wrapper as unknown as PoolClient;
  },
  async query<T extends object>(
    sql: string, params?: unknown[],
  ): Promise<QueryResult<T>> {
    const lease = await selected.connect();
    try {
      return await lease.query<T>(sql, params);
    } finally {
      lease.release();
    }
  },
} as unknown as PostgresPool;

const fingerprints = new Issue416A01RequestFingerprint(
  new TrustedClientAddressResolver(),
);
const deriver = new AntiAbuseKeyDeriver();
const auth = new Issue416A01ProtectedLogin(selected, fingerprints, deriver);
const committedIds: string[] = [];

async function seedUser() {
  const userId = randomUUID();
  const email = `w35-${userId}@fixture.invalid`;
  const phc = await hashStaffPassword(rawPassword);
  const c = await admin.connect();
  try {
    await c.query("BEGIN");
    await c.query(
      `INSERT INTO public.users(id,email,password_hash,status,updated_at)
       VALUES ($1::uuid,$2,$3,'ACTIVE',clock_timestamp())`,
      [userId, email, phc],
    );
    await c.query("SET ROLE vap1_proof_owner");
    await c.query(
      `INSERT INTO auth_proof_private.proof_keys(
         audience,key_id,root_key,promotion_epoch,disposition
       ) VALUES ($1,$2,$3::bytea,1,'ACTIVE_SIGNING')
       ON CONFLICT DO NOTHING`, [audience, keyId, rootKey],
    );
    await c.query(
      `INSERT INTO auth_proof_private.key_selection(
         audience,key_id,promotion_epoch
       ) VALUES ($1,$2,1) ON CONFLICT DO NOTHING`, [audience, keyId],
    );
    await c.query(
      `UPDATE auth_proof_private.proof_purposes SET enabled=true
       WHERE purpose='STAFF_LOGIN_COMMIT'`,
    );
    await c.query(
      `UPDATE auth_proof_private.security_boundary SET phase='DRAINED',
         boundary_epoch=2 WHERE singleton AND phase='LEGACY_COMPAT'`,
    );
    await c.query(
      `UPDATE auth_proof_private.security_boundary
       SET phase='PROTECTED',deployment_audience=$1,
         t0_audit_event_id=$2::uuid,boundary_epoch=3
       WHERE singleton AND phase='DRAINED'`,
      [audience, randomUUID()],
    );
    await c.query(
      `INSERT INTO auth_proof_private.authority_admissions(
         audience,object_kind,object_key_bytes,disposition,
         admission_version,material_digest,operator_reference,audit_event_id
       ) SELECT $1,'USER',decode('01' || replace($2::text,'-',''),'hex'),
         'ADMIT',1,
         substring(auth_proof_private.user_state_row_v1($2::uuid),
           octet_length(auth_proof_private.user_state_row_v1($2::uuid))-31,32),
         'worker35-synthetic',$3::uuid`,
      [audience, userId, randomUUID()],
    );
    await c.query("COMMIT");
    await c.query("RESET ROLE");
  } catch (error) {
    await c.query("ROLLBACK");
    await c.query("RESET ROLE");
    throw error;
  } finally {
    c.release();
  }
  return { userId, email, phc };
}

async function reserve(email: string) {
  const key = deriver.derive("v1:staff-login-identifier", email);
  const id = randomUUID();
  await admin.query(
    `INSERT INTO public.anti_abuse_events(id,scope,key_hash,state)
     VALUES($1::uuid,$2,$3,'PENDING')`,
    [id, key.scope, key.keyHash],
  );
  return { id, key };
}

async function state(id: string) {
  const result = await admin.query<{ state: string }>(
    `SELECT state FROM public.anti_abuse_events WHERE id=$1::uuid`, [id],
  );
  return result.rows[0]?.state;
}

async function main() {
  const source = await admin.query<{
    current_database: string;
    server_version_num: string;
  }>("SELECT current_database(),current_setting('server_version_num') AS server_version_num");
  assert.equal(source.rows[0]?.current_database, fixtureName);
  assert.ok(Number(source.rows[0]?.server_version_num) >= 170000);
  const acl = await admin.query<{ accessible: boolean }>(
    `SELECT has_function_privilege('issue416_w35_runtime',
       'auth_proof_private.a01_execute(uuid,bytea,bytea,text,uuid,uuid,bytea,uuid,uuid,text,text,uuid,bytea)',
       'EXECUTE') AS accessible`,
  );
  assert.equal(acl.rows[0]?.accessible, false);
  const { userId, email, phc } = await seedUser();
  const successReservation = await reserve(email);
  const tokens = await auth.login(email, rawPassword, successReservation, request);
  assert.match(tokens.accessToken, /^vsa1\.[A-Za-z0-9_-]{43}$/);
  assert.match(tokens.refreshToken, /^vsr1\.[A-Za-z0-9_-]{43}$/);
  assert.equal(await state(successReservation.id), "IGNORED");
  committedIds.push(tokens.staffAuthSessionId);
  const count = await admin.query<{ sessions: string; receipts: string; audits: string }>(
    `SELECT (SELECT count(*)::text FROM public.staff_auth_sessions
       WHERE user_id=$1::uuid) AS sessions,
       (SELECT count(*)::text FROM auth_proof_private.operation_receipts r
       JOIN auth_proof_private.proof_challenges c
       ON c.challenge_id=r.challenge_id
       WHERE r.purpose='STAFF_LOGIN_COMMIT'
       AND c.subject_user_id=$1::uuid) AS receipts,
       (SELECT count(*)::text FROM public.account_security_audit_events
       WHERE event_type='STAFF_LOGIN_SESSION_CREATED'
       AND subject_user_id=$1::uuid) AS audits`,
    [userId],
  );
  assert.deepEqual(count.rows[0], { sessions: "1", receipts: "1", audits: "1" });
  const wrongPasswordReservation = await reserve(email);
  await assert.rejects(auth.login(
    email, phc, wrongPasswordReservation, request,
  ), StaffAuthenticationError);
  assert.equal(await state(wrongPasswordReservation.id), "COUNTED");
  const unknownReservation = await reserve(email);
  simulateLostCommit = true;
  const recoveredTokens = await auth.login(email, rawPassword, unknownReservation, request);
  assert.match(recoveredTokens.accessToken, /^vsa1\.[A-Za-z0-9_-]{43}$/);
  assert.equal(await state(unknownReservation.id), "IGNORED");
  assert.equal(simulateLostCommit, false);
  committedIds.push(recoveredTokens.staffAuthSessionId);
  const badReceipt = await reconcileA01UnknownCommit(selected, {
    audience, operationId: randomUUID(), userId,
    sessionId: tokens.staffAuthSessionId,
    refreshId: randomUUID(), limiterReservationId: successReservation.id,
    accessHash: "staff-access-sha256:v1:" + "f".repeat(64),
    refreshHash: "staff-refresh-sha256:v1:" + "f".repeat(64),
  });
  assert.equal(badReceipt, undefined);
  const persisted = await admin.query<{ sessions: string; receipts: string; audits: string }>(
    `SELECT (SELECT count(*)::text FROM public.staff_auth_sessions
       WHERE user_id=$1::uuid) AS sessions,
       (SELECT count(*)::text FROM auth_proof_private.operation_receipts r
       JOIN auth_proof_private.proof_challenges c
       ON c.challenge_id=r.challenge_id
       WHERE r.purpose='STAFF_LOGIN_COMMIT'
       AND c.subject_user_id=$1::uuid) AS receipts,
       (SELECT count(*)::text FROM public.account_security_audit_events
       WHERE event_type='STAFF_LOGIN_SESSION_CREATED'
       AND subject_user_id=$1::uuid) AS audits`, [userId],
  );
  assert.deepEqual(persisted.rows[0], { sessions: "2", receipts: "2", audits: "2" });
  console.log("W35 isolated PG17: positive raw Argon2, receipt/audit, negative PHC, UNKNOWN COMMIT and ACL PASS");
}

void main().finally(async () => {
  rootKey.fill(0);
  antiAbuseRoot.fill(0);
  await admin.end();
  await app.end();
}).catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
