import type { PoolClient } from "pg";
import { expect } from "vitest";

import { fixture } from "./dashboard-issue333-lab";

const pathFor = (organizationId: string) =>
  `/v1/staff/dashboard/organizations/${organizationId}/locations`;

export async function actor(sentinel: string) {
  const user = await fixture.createUser();
  const membership = await fixture.createMembership(user.id, {
    role: "LOCATION_MANAGER",
  });
  const location = await fixture.addLocation(membership.organizationId, {
    name: sentinel,
  });
  await fixture.query(
    `INSERT INTO membership_location_access
       (organization_id, membership_id, location_id) VALUES($1,$2,$3)`,
    [membership.organizationId, membership.membershipId, location.locationId],
  );
  const auth = await fixture.nativeLogin(user);
  return {
    user,
    membership,
    location,
    auth,
    path: pathFor(membership.organizationId),
  };
}

export function fetchProtected(
  base: string,
  path: string,
  token: string,
  trace: string,
  signal?: AbortSignal,
) {
  return fetch(`${base}${path}`, {
    headers: { authorization: `Bearer ${token}`, "x-u002-trace": trace },
    method: "GET",
    signal: signal ?? null,
  }).then(async (response) => ({
    status: response.status,
    body: await response.text(),
  }));
}

export async function persistentWitness(
  userId: string,
  sessionId: string,
  operationId: string,
) {
  const result = await fixture.query<{
    status: string;
    revoked: boolean;
    audits: number;
    db_pid: number;
    pg_port: number;
    database: string;
    pg_version: number;
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
  expect(result.rows[0]).toMatchObject({
    status: "DISABLED",
    revoked: true,
    audits: 1,
  });
  return result.rows[0]!;
}

export interface HeldSecurityLock {
  client: PoolClient;
  holderPid: number;
  key: { classid: string; objid: string };
}

export async function waitForQueuedAdvisory(
  minimum: number,
  key: HeldSecurityLock["key"],
) {
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
  throw new Error(
    `Expected ${minimum} real queued PostgreSQL advisory lock waiters.`,
  );
}

export async function holdUserSecurity(
  userId: string,
): Promise<HeldSecurityLock> {
  const held = await fixture.databasePool().connect();
  try {
    await held.query("BEGIN");
    await held.query(
      `SELECT pg_advisory_xact_lock(hashtextextended('staff-user-security:' || $1::text,0))`,
      [userId],
    );
    const result = await held.query<{
      holder_pid: number;
      classid: string;
      objid: string;
    }>(
      `SELECT pg_backend_pid() AS holder_pid,
        ((hashtextextended('staff-user-security:' || $1::text,0) >> 32)
          & 4294967295)::oid::text AS classid,
        (hashtextextended('staff-user-security:' || $1::text,0)
          & 4294967295)::oid::text AS objid`,
      [userId],
    );
    const row = result.rows[0]!;
    return {
      client: held,
      holderPid: row.holder_pid,
      key: { classid: row.classid, objid: row.objid },
    };
  } catch (error) {
    held.release();
    throw error;
  }
}
