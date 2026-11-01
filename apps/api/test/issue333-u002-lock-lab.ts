import { Pool, type PoolClient } from "pg";

import { fixture } from "./dashboard-issue333-lab";

export interface LockLease {
  readonly client: PoolClient;
  readonly pid: number;
}

export const makeLockPool = (max = 6, acquisitionMs = 3_000) =>
  new Pool({
    connectionString: fixture.runtimeDatabaseUrl(),
    connectionTimeoutMillis: acquisitionMs,
    max,
  });

export async function openLockLease(pool: Pool): Promise<LockLease> {
  const client = await pool.connect();
  try {
    await client.query("SET lock_timeout = '4000ms'");
    await client.query("SET statement_timeout = '6000ms'");
    const pid = Number(
      (await client.query("SELECT pg_backend_pid()::int AS pid")).rows[0]!.pid,
    );
    return { client, pid };
  } catch (error) {
    client.release(true);
    throw error;
  }
}

const orgKey = "hashtextextended('staff-management-org:' || $1::text, 0)";

export function sessionShared(lease: LockLease, organizationId: string) {
  return lease.client.query(`SELECT pg_advisory_lock_shared(${orgKey})`, [
    organizationId,
  ]);
}

export function sessionUnlock(lease: LockLease, organizationId: string) {
  return lease.client.query(`SELECT pg_advisory_unlock_shared(${orgKey})`, [
    organizationId,
  ]);
}

export function transactionExclusive(lease: LockLease, organizationId: string) {
  return lease.client.query(`SELECT pg_advisory_xact_lock(${orgKey})`, [
    organizationId,
  ]);
}

export async function waitForBlockers(
  pid: number,
  expected: number[],
  timeoutMs = 2_800,
) {
  const deadline = Date.now() + timeoutMs;
  const wanted = [...expected].sort((a, b) => a - b);
  while (Date.now() < deadline) {
    const result = await fixture.query<{
      blockers: number[];
      waitType: string | null;
    }>(
      `SELECT pg_blocking_pids($1) AS blockers,
       (SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1) AS "waitType"`,
      [pid],
    );
    const observed = [...(result.rows[0]?.blockers ?? [])].sort(
      (a, b) => a - b,
    );
    if (
      JSON.stringify(observed) === JSON.stringify(wanted) &&
      (wanted.length === 0 || result.rows[0]?.waitType === "Lock")
    ) {
      return { blockers: observed, waitType: result.rows[0]?.waitType ?? null };
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(
    `PostgreSQL blockers for PID ${pid} never matched expected set.`,
  );
}

export async function waitForCanonicalWriter(
  readerPid: number,
  timeoutMs = 2_800,
): Promise<{ pid: number; blockers: number[] }> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await fixture.query<{
      pid: number;
      blockers: number[];
    }>(
      `SELECT pid, pg_blocking_pids(pid) AS blockers
       FROM pg_stat_activity
       WHERE datname=current_database() AND wait_event_type='Lock'
         AND query LIKE '%pg_advisory_xact_lock%'
         AND pid<>pg_backend_pid()`,
    );
    const match = result.rows.find((row) => row.blockers.includes(readerPid));
    if (match) return { pid: match.pid, blockers: match.blockers };
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Canonical HTTP writer did not visibly wait on shared PID.");
}

export async function closeLockLeases(...leases: LockLease[]) {
  for (const lease of leases) {
    await lease.client.query("ROLLBACK").catch(() => undefined);
    await lease.client
      .query("SELECT pg_advisory_unlock_all()")
      .catch(() => undefined);
    lease.client.release(true);
  }
}

export function trace(name: string, data: Record<string, unknown>) {
  console.log("ISSUE333_U002_W5", JSON.stringify({ name, ...data }));
}
