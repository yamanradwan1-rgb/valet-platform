import { randomUUID } from "node:crypto";

import type { PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { fixture, startIssue333Lab, stopIssue333Lab } from "./dashboard-issue333-lab";
import { controlledDisable, OwnedPeer } from "./issue333-u002-emergency-harness";

const peers: OwnedPeer[] = [];
const pathFor = (organizationId: string) =>
  `/v1/staff/dashboard/organizations/${organizationId}/locations`;

async function actor(sentinel: string) {
  const user = await fixture.createUser();
  const membership = await fixture.createMembership(user.id, { role: "LOCATION_MANAGER" });
  const location = await fixture.addLocation(membership.organizationId, { name: sentinel });
  await fixture.query(
    `INSERT INTO membership_location_access
       (organization_id, membership_id, location_id) VALUES($1,$2,$3)`,
    [membership.organizationId, membership.membershipId, location.locationId],
  );
  const auth = await fixture.nativeLogin(user);
  return { user, membership, location, auth, path: pathFor(membership.organizationId) };
}

function fetchProtected(
  base: string, path: string, token: string, trace: string,
  signal?: AbortSignal,
) {
  return fetch(`${base}${path}`, {
    headers: { authorization: `Bearer ${token}`, "x-u002-trace": trace },
    method: "GET", signal: signal ?? null,
  }).then(async (response) => ({ status: response.status, body: await response.text() }));
}

async function persistentWitness(userId: string, sessionId: string, operationId: string) {
  const result = await fixture.query<{
    status: string; revoked: boolean; audits: number;
    db_pid: number; pg_port: number; database: string; pg_version: number;
  }>(
    `SELECT u.status::text AS status, s.revoked_at IS NOT NULL AS revoked,
      (SELECT count(*)::int FROM account_security_audit_events
       WHERE id=$3 AND subject_user_id=$1 AND event_type='STAFF_USER_SECURITY_DISABLED') AS audits,
      pg_backend_pid() AS db_pid, inet_server_port() AS pg_port,
      current_database() AS database,
      current_setting('server_version_num')::int AS pg_version
     FROM users u JOIN staff_auth_sessions s ON s.user_id=u.id
     WHERE u.id=$1 AND s.id=$2`,
    [userId, sessionId, operationId],
  );
  expect(result.rowCount).toBe(1);
  expect(result.rows[0]).toMatchObject({ status: "DISABLED", revoked: true, audits: 1 });
  return result.rows[0]!;
}

interface HeldSecurityLock {
  client: PoolClient;
  holderPid: number;
  key: { classid: string; objid: string };
}

async function waitForQueuedAdvisory(minimum: number, key: HeldSecurityLock["key"]) {
  const until = Date.now() + 10_000;
  while (Date.now() < until) {
    const result = await fixture.query<{ pid: number; blockers: number[] }>(
      `SELECT pid, pg_blocking_pids(pid) AS blockers FROM pg_locks
       WHERE locktype='advisory' AND NOT granted AND mode='ExclusiveLock'
         AND objsubid=1 AND classid=$1::oid AND objid=$2::oid
         AND database=(SELECT oid FROM pg_database WHERE datname=current_database())`,
      [key.classid, key.objid],
    );
    if (result.rows.length >= minimum) return result.rows;
    await new Promise((done) => setTimeout(done, 25));
  }
  throw new Error(`Expected ${minimum} real queued PostgreSQL advisory lock waiters.`);
}

async function holdUserSecurity(userId: string): Promise<HeldSecurityLock> {
  const held = await fixture.databasePool().connect();
  try {
    await held.query("BEGIN");
    await held.query(
      `SELECT pg_advisory_xact_lock(hashtextextended('staff-user-security:' || $1::text,0))`,
      [userId],
    );
    const result = await held.query<{
      holder_pid: number; classid: string; objid: string;
    }>(
      `SELECT pg_backend_pid() AS holder_pid,
        ((hashtextextended('staff-user-security:' || $1::text,0) >> 32)
          & 4294967295)::oid::text AS classid,
        (hashtextextended('staff-user-security:' || $1::text,0)
          & 4294967295)::oid::text AS objid`,
      [userId],
    );
    const row = result.rows[0]!;
    return { client: held, holderPid: row.holder_pid,
      key: { classid: row.classid, objid: row.objid } };
  } catch (error) { held.release(); throw error; }
}

beforeAll(startIssue333Lab, 180_000);
afterAll(async () => {
  try {
    for (const peer of peers.reverse()) await peer.stop();
  } finally {
    await stopIssue333Lab();
  }
}, 90_000);

describe("#333 U-002 independent Nest processes and canonical emergency disable", () => {
  it("witnesses reader-first, emergency-first, slow delivery, disconnect and lost success ACK", async () => {
    const first = await actor(`ISSUE333-EMERGENCY-A-${randomUUID()}`);
    const reader = new OwnedPeer(fixture.runtimeDatabaseUrl(), "held", true);
    const fresh = new OwnedPeer(fixture.runtimeDatabaseUrl(), "fresh", false);
    peers.push(reader, fresh);
    const [readerReady, freshReady] = await Promise.all([
      reader.wait("ready", 35_000), fresh.wait("ready", 35_000),
    ]);
    expect(reader.pid).not.toBe(fresh.pid);
    const readerBase = readerReady.baseUrl!;
    const freshBase = freshReady.baseUrl!;
    const baseline = await fetchProtected(freshBase, first.path, first.auth.accessToken, "baseline");
    expect(baseline.status).toBe(200);
    expect(baseline.body).toContain(first.location.name);

    const held = reader.wait("sql-completed-http-held", 20_000, "held");
    const pending = fetchProtected(readerBase, first.path, first.auth.accessToken, "reader-first");
    const entered = await held;
    expect(entered.pid).toBe(reader.pid);
    // The real SQL transaction ended. Hold the actual Nest response before serialization.
    await new Promise((done) => setTimeout(done, 250));
    const operationId = randomUUID();
    const startedAt = new Date().toISOString();
    const operation = controlledDisable(first.user.id, operationId, fixture.migrationDatabaseUrl());
    const cli = await operation.result;
    const witness = await persistentWitness(first.user.id, first.auth.sessionId, operationId);
    const beforeRelease = new Date().toISOString();
    const finishPromise = reader.wait("http-finish", 15_000, "reader-first");
    reader.release("held");
    const [result, delivered] = await Promise.all([pending, finishPromise]);
    const after = await fetchProtected(freshBase, first.path, first.auth.accessToken, "emergency-first");
    const newAdmissionFinish = await fresh.wait("http-finish", 10_000, "emergency-first");
    const retry = controlledDisable(first.user.id, operationId, fixture.migrationDatabaseUrl());
    const retryExit = await retry.result;
    const replay = await persistentWitness(first.user.id, first.auth.sessionId, operationId);

    const second = await actor(`ISSUE333-EMERGENCY-DISCONNECT-${randomUUID()}`);
    const disconnect = new AbortController();
    const secondGate = reader.wait("sql-completed-http-held", 20_000, "held");
    const aborted = fetchProtected(readerBase, second.path, second.auth.accessToken,
      "disconnect", disconnect.signal).catch((error: unknown) =>
      error instanceof Error ? error.name : "unknown");
    await secondGate;
    const closePromise = reader.wait("http-close", 10_000, "disconnect");
    disconnect.abort();
    const abortedResult = await aborted;
    const closed = await closePromise;
    const secondOperationId = randomUUID();
    const secondCli = await controlledDisable(second.user.id, secondOperationId,
      fixture.migrationDatabaseUrl()).result;
    const secondWitness = await persistentWitness(second.user.id,
      second.auth.sessionId, secondOperationId);
    reader.release("held");
    const noFinish = await reader.wait("http-finish", 500, "disconnect")
      .then(() => false, () => true);

    // Admission queued after a security writer requests the same real PG lock.
    const third = await actor(`ISSUE333-EMERGENCY-QUEUED-${randomUUID()}`);
    const lockHolder = await holdUserSecurity(third.user.id);
    let queued: { pid: number; blockers: number[] }[] = [];
    let queuedResponse: { status: number; body: string };
    let queuedExit: { pid: number; exitedAt: string };
    const thirdOperationId = randomUUID();
    const thirdCommand = controlledDisable(third.user.id, thirdOperationId,
      fixture.migrationDatabaseUrl());
    try {
      const writerQueued = await waitForQueuedAdvisory(1, lockHolder.key);
      expect(writerQueued[0]?.blockers).toContain(lockHolder.holderPid);
      const incoming = fetchProtected(freshBase, third.path, third.auth.accessToken, "queued-admission");
      const bothQueued = await waitForQueuedAdvisory(2, lockHolder.key);
      expect(bothQueued.some((row) => row.pid !== writerQueued[0]!.pid &&
        (row.blockers.includes(writerQueued[0]!.pid) ||
          row.blockers.includes(lockHolder.holderPid)))).toBe(true);
      queued = [...writerQueued, ...bothQueued];
      await lockHolder.client.query("COMMIT");
      queuedExit = await thirdCommand.result;
      queuedResponse = await incoming;
    } finally {
      await lockHolder.client.query("ROLLBACK").catch(() => undefined);
      lockHolder.client.release();
      await thirdCommand.result.catch(() => undefined);
    }
    const thirdWitness = await persistentWitness(third.user.id,
      third.auth.sessionId, thirdOperationId);

    const evidence = {
      apiPids: [reader.pid, fresh.pid], commandPids: [cli.pid, retryExit.pid, secondCli.pid],
      postgres: { port: witness.pg_port, db: witness.database, version: witness.pg_version,
        witnessBackendPid: witness.db_pid },
      readerFirst: { gateAt: entered.at, cliStartedAt: startedAt,
        cliExitedAt: cli.exitedAt, persistedBeforeReleaseAt: beforeRelease,
        finishAt: delivered.at, status: result.status,
        privateLocationSent: result.body.includes(first.location.name) },
      emergencyFirst: { status: after.status, finishAt: newAdmissionFinish.at,
        privateLocationSent: after.body.includes(first.location.name) },
      lostConsumerAckRetry: { retryExitedAt: retryExit.exitedAt,
        auditCount: replay.audits, disabled: replay.status === "DISABLED" },
      disconnected: { abortedResult, closeAt: closed.at, closeFinished: closed.finished,
        laterFinish: !noFinish, disableExitedAt: secondCli.exitedAt,
        disabled: secondWitness.status === "DISABLED" },
      queuedAdmission: { holderPgPid: lockHolder.holderPid,
        key: lockHolder.key, advisoryWaiters: queued, commandPid: queuedExit.pid,
        commandExitedAt: queuedExit.exitedAt, status: queuedResponse.status,
        privateLocationSent: queuedResponse.body.includes(third.location.name),
        disabled: thirdWitness.status === "DISABLED" },
    };
    console.log("ISSUE333_U002_EMERGENCY_EVIDENCE", JSON.stringify(evidence));

    expect(witness.pg_version).toBeGreaterThanOrEqual(170000);
    expect(witness.pg_version).toBeLessThan(180000);
    expect(newAdmissionFinish.finished).toBe(true);
    expect(after.status).not.toBe(200);
    expect(after.body).not.toContain(first.location.name);
    expect(closed.finished).toBe(false);
    expect(noFinish).toBe(true);
    expect(queuedResponse.status).not.toBe(200);
    expect(queuedResponse.body).not.toContain(third.location.name);
    expect(result.body).not.toContain(first.location.name); // Expected RED if old reply leaks.
    expect(result.status).not.toBe(200);
  }, 120_000);
});
