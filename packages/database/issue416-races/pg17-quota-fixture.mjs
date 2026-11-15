import { randomBytes, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { setTimeout as delay } from "node:timers/promises";

import { BLOCKING_WITNESS_SQL, validateBlockingWitness } from "./race-pg-observer.mjs";
import { runPg17ReadOnlyPreflight } from "./pg17-acceptance-runtime.mjs";
import { assertAcceptanceEnvironment } from "./pg17-acceptance-target.mjs";

const require = createRequire(new URL("../package.json", import.meta.url));
const QUOTA_SQL = `SELECT bundle_state, reservation_ids FROM
  auth_proof_private.reserve_reset_issue_quota(
  $1::text,$2::uuid,$3::bytea,$4::uuid,$5::uuid,$6::uuid,
  $7::uuid,$8::uuid,$9::text,$10::text,$11::text,$12::text)`;

export function quotaInput({ audience = `w38-${randomUUID()}`, operationId = randomUUID(),
  fingerprint = randomBytes(32), targetHash } = {}) {
  const digest = () => `anti-abuse-hmac-sha256:v1:${randomBytes(32).toString("hex")}`;
  return Object.freeze({
    audience, operationId, fingerprint,
    issuerUserId: randomUUID(), issuerMembershipId: randomUUID(),
    targetUserId: randomUUID(), targetMembershipId: randomUUID(),
    organizationId: randomUUID(),
    targetHash: targetHash ?? digest(), issuerHash: digest(),
    organizationHash: digest(), clientAddressHash: digest(),
  });
}

export function quotaParams(input) {
  return [input.audience, input.operationId, input.fingerprint,
    input.issuerUserId, input.issuerMembershipId, input.targetUserId,
    input.targetMembershipId, input.organizationId, input.targetHash,
    input.issuerHash, input.organizationHash, input.clientAddressHash];
}

export async function reserve(client, input) {
  const rows = (await client.query(QUOTA_SQL, quotaParams(input))).rows;
  if (rows.length !== 1 || rows[0]?.bundle_state !== "PENDING" ||
    !Array.isArray(rows[0].reservation_ids) || rows[0].reservation_ids.length !== 4 ||
    new Set(rows[0].reservation_ids).size !== 4) {
    throw new Error("W38_QUOTA_RESERVATION_INCOMPLETE");
  }
  return rows[0].reservation_ids;
}

export async function begin(client, lockMs = 2500) {
  await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
  await client.query(`SET LOCAL lock_timeout = '${lockMs}ms'`);
  await client.query("SET LOCAL statement_timeout = '3500ms'");
}

export async function observeQuotaWait(observer, waitingPid, holdingPid) {
  // pg_stat_activity hides another backend's wait_event_type when the
  // observer is SET ROLE to NOLOGIN vap1_proof_owner. Observe as the same
  // fixture login as both backends, then restore the private owner.
  await observer.query("RESET ROLE");
  try {
  const end = Date.now() + 1400;
  let lastShape = [];
  while (Date.now() < end) {
    const rows = (await observer.query(BLOCKING_WITNESS_SQL, [waitingPid, holdingPid])).rows;
    lastShape = rows.map((row) => ({
      waitingPid: row.waiting_pid, holdingPid: row.holding_pid,
      waitingEventType: row.wait_event_type,
      waitingLockType: row.waiting_lock_type, holdingGranted: row.holding_granted,
      blockingPids: row.blocking_pids,
    }));
    try {
      const witness = validateBlockingWitness(rows, {
        waitingPid, holdingPid, namedFence: "R02_DORMANT_QUOTA_SQL_ADVISORY",
      });
      if (witness.observedPhysicalWait && witness.namedFenceVerified === false) {
        return witness;
      }
    } catch (error) {
      if (error.message !== "ISSUE416_RACE_PHYSICAL_LOCK_WAIT_NOT_OBSERVED") throw error;
    }
    await delay(20);
  }
  throw new Error(`W38_QUOTA_LOCK_WAIT_NOT_OBSERVED:${JSON.stringify(lastShape)}`);
  } finally {
    await observer.query("SET ROLE vap1_proof_owner");
  }
}

export async function quotaCounts(client, audience, operationId) {
  const bundles = await client.query(`SELECT count(*)::int AS n FROM
    auth_proof_private.reset_issue_quota_bundles WHERE audience=$1 AND operation_id=$2`,
  [audience, operationId]);
  const entries = await client.query(`SELECT count(*)::int AS n FROM
    auth_proof_private.reset_issue_quota_entries WHERE audience=$1 AND operation_id=$2`,
  [audience, operationId]);
  return [bundles.rows[0].n, entries.rows[0].n];
}

function privilegedQuotaClient(env) {
  const t = assertAcceptanceEnvironment(env);
  const Client = require("pg").Client;
  return new Client({ host: t.host, port: t.port, database: t.database,
    user: "issue416_w38_migrator", password: t.password, ssl: false,
    connectionTimeoutMillis: 3000, query_timeout: 4500,
    application_name: "issue416_w38_dormant_quota_negative" });
}

async function attestPrivilegedClient(client, target) {
  const rows = (await client.query(`SELECT pg_backend_pid() AS pid,
    current_database() AS db, current_user AS actor, session_user AS login,
    shobj_description(d.oid,'pg_database') AS marker,
    current_setting('server_version_num')::integer AS version,
    pg_is_in_recovery() AS recovery
    FROM pg_database d WHERE d.datname=current_database()`)).rows;
  const row = rows[0];
  if (rows.length !== 1 || row.db !== target.database ||
    row.marker !== target.marker || row.actor !== "issue416_w38_migrator" ||
    row.login !== "issue416_w38_migrator" || !Number.isInteger(row.pid) ||
    row.version < 170000 || row.version >= 180000 || row.recovery !== false) {
    throw new Error("W38_QUOTA_PRIVILEGED_CONNECTION_UNTRUSTED");
  }
  await client.query("SET ROLE vap1_proof_owner");
  const owned = (await client.query("SELECT current_user AS actor")).rows[0];
  if (owned?.actor !== "vap1_proof_owner") throw new Error("W38_QUOTA_OWNER_ROLE_DENIED");
  return row.pid;
}

// The privileged role is permitted only inside this owned, source-exact test DB.
// This checks the dormant quota SQL, not a valid issuer, signer or R02 command.
export async function withQuotaPair(callback, env = process.env) {
  const target = assertAcceptanceEnvironment(env);
  await runPg17ReadOnlyPreflight(env);
  const a = privilegedQuotaClient(env);
  const b = privilegedQuotaClient(env);
  try {
    await a.connect();
    await b.connect();
    const aid = await attestPrivilegedClient(a, target);
    const bid = await attestPrivilegedClient(b, target);
    if (aid === bid) throw new Error("W38_QUOTA_NOT_TWO_BACKENDS");
    const lease = (await a.query("SELECT pg_try_advisory_lock(416,38) AS owned")).rows[0];
    if (lease?.owned !== true) throw new Error("W38_QUOTA_EXCLUSIVE_FIXTURE_LEASE_UNAVAILABLE");
    const other = (await b.query("SELECT pg_try_advisory_lock(416,38) AS owned")).rows[0];
    if (other?.owned !== false) throw new Error("W38_QUOTA_LEASE_NOT_EXCLUSIVE");
    return await callback({ a, b, aid, bid });
  } finally {
    await Promise.allSettled([a.end(), b.end()]);
  }
}
