import { Client, Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DatabaseStaffSessionContextResolver } from '../src/modules/auth/staff-session-context';
import { inAuthorizedPhysicalResourceOverview } from '../src/modules/dashboard/physical-resource-overview-transaction';
import { actor, event, fixture, startLab, trace } from './dashboard-issue319-lab';

beforeAll(startLab, 180_000);
afterAll(async () => {
  if (trace.length) console.log('ISSUE319_PHYSICAL_LEASE_TRACE', JSON.stringify(trace.splice(0)));
  await fixture.stop();
}, 90_000);

async function observeSessionAdvisoryWait() {
  const deadline = Date.now() + 7_000;
  while (Date.now() < deadline) {
    const result = await fixture.query<{ pid: number; blockers: number[] }>(`SELECT
      activity.pid, pg_blocking_pids(activity.pid) AS blockers
      FROM pg_stat_activity AS activity
      INNER JOIN pg_locks AS waiting ON waiting.pid=activity.pid
      WHERE activity.datname=current_database() AND activity.wait_event_type='Lock'
        AND waiting.locktype='advisory' AND waiting.mode='ShareLock'
        AND waiting.granted=FALSE`);
    const waiter = result.rows.find((row) => row.blockers.length > 0);
    if (waiter) {
      event('PHYSICAL_RR_SESSION_SHARED_ADVISORY_BLOCKED');
      return waiter.pid;
    }
    await new Promise((done) => setTimeout(done, 10));
  }
  throw new Error('Physical RR session advisory wait was not observable.');
}

describe('Issue319 Physical RR session advisory lease cleanup', () => {
  it('cancels session advisory acquisition, destroys ambiguous lease, and reauthorizes on fresh pool client', async () => {
    const a = await actor();
    const pool = new Pool({
      connectionString: fixture.runtimeDatabaseUrl(), max: 1,
      options: '-c statement_timeout=900ms',
    });
    const gate = new Client({ connectionString: fixture.migrationDatabaseUrl() });
    await gate.connect();
    try {
      const session = await new DatabaseStaffSessionContextResolver(pool)
        .resolve(`Bearer ${a.auth.accessToken}`);
      await gate.query('BEGIN');
      await gate.query(
        `SELECT pg_advisory_xact_lock(hashtextextended('staff-management-org:' || $1::text,0))`,
        [a.organizationId],
      );
      const pending = inAuthorizedPhysicalResourceOverview(pool, session, a.locationId,
        async () => 'UNEXPECTED_PROJECTION');
      const pid = await observeSessionAdvisoryWait();
      expect(pid).toBeGreaterThan(0);
      await expect(pending).rejects.toMatchObject({ code: '57014' });
      event('PHYSICAL_RR_SESSION_ACQUIRE_TIMEOUT_57014');
      expect(pool.totalCount).toBe(0);
      expect(pool.waitingCount).toBe(0);
      await gate.query('COMMIT');
      expect(await inAuthorizedPhysicalResourceOverview(pool, session, a.locationId,
        async (_, scope) => scope.locationId)).toBe(a.locationId);
      const leftovers = await pool.query<{ n: string }>(`SELECT count(*)::text AS n
        FROM pg_locks WHERE pid=pg_backend_pid() AND locktype='advisory' AND granted`);
      expect(Number(leftovers.rows[0]?.n)).toBe(0);
      event('PHYSICAL_RR_FRESH_POOL_CLIENT_NO_LOCK_REUSE');
    } finally {
      await gate.query('ROLLBACK').catch(() => undefined);
      await gate.end();
      await pool.end();
    }
  }, 25_000);

  it('rolls back projection exception, releases session advisory, and permits safe retry', async () => {
    const a = await actor();
    const pool = new Pool({ connectionString: fixture.runtimeDatabaseUrl(), max: 1 });
    try {
      const session = await new DatabaseStaffSessionContextResolver(pool)
        .resolve(`Bearer ${a.auth.accessToken}`);
      await expect(inAuthorizedPhysicalResourceOverview(pool, session, a.locationId,
        async () => { throw new Error('SYNTHETIC_PHYSICAL_RR_PROJECTION_FAILURE'); }))
        .rejects.toThrow('SYNTHETIC_PHYSICAL_RR_PROJECTION_FAILURE');
      const leftovers = await pool.query<{ n: string }>(`SELECT count(*)::text AS n
        FROM pg_locks WHERE pid=pg_backend_pid() AND locktype='advisory' AND granted`);
      expect(Number(leftovers.rows[0]?.n)).toBe(0);
      expect(await inAuthorizedPhysicalResourceOverview(pool, session, a.locationId,
        async (_, scope) => scope.organizationId)).toBe(a.organizationId);
      event('PHYSICAL_RR_ROLLBACK_SESSION_UNLOCK_AND_RETRY');
    } finally { await pool.end(); }
  }, 25_000);
});
