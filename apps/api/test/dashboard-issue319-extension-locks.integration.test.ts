import { Client, Pool } from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import * as dashboardAuth from '../src/modules/dashboard/dashboard-read-authorization';
import { inAuthorizedKpiSnapshot } from '../src/modules/dashboard/analytics-kpi-snapshot-transaction';
import { actor, event, fixture, latch, overviewPath, startLab, trace } from './dashboard-issue319-lab';

beforeAll(startLab, 180_000);
afterAll(() => fixture.stop(), 90_000);
afterEach(() => {
  vi.restoreAllMocks();
  if (trace.length) console.log('ISSUE319_LOCK_EXTENSION_TRACE', JSON.stringify(trace.splice(0)));
});

const exclusive = (organizationId: string) => ({
  text: `SELECT pg_advisory_xact_lock(hashtextextended('staff-management-org:' || $1::text,0))`,
  values: [organizationId],
});

async function waitForBlocked(minimum: number) {
  const until = Date.now() + 7000;
  while (Date.now() < until) {
    const result = await fixture.query<{ n: string }>(`SELECT count(*)::text AS n
      FROM pg_stat_activity WHERE datname=current_database()
        AND wait_event_type='Lock' AND pid<>pg_backend_pid()`);
    if (Number(result.rows[0]?.n) >= minimum) {
      event(`PG_OBSERVED_${minimum}_LOCK_WAITERS`);
      return;
    }
    await new Promise((done) => setTimeout(done, 10));
  }
  throw new Error(`No observable PostgreSQL lock wait of ${minimum}.`);
}

async function waitForExclusiveAdvisoryWriter(blockers: number, expectedPid?: number) {
  const until = Date.now() + 7_000;
  while (Date.now() < until) {
    const result = await fixture.query<{ pid: number; blockedBy: number[] }>(`SELECT
      activity.pid, pg_blocking_pids(activity.pid) AS "blockedBy"
      FROM pg_stat_activity AS activity
      INNER JOIN pg_locks AS waiting ON waiting.pid=activity.pid
      WHERE activity.datname=current_database() AND activity.wait_event_type='Lock'
        AND waiting.locktype='advisory' AND waiting.mode='ExclusiveLock'
        AND NOT waiting.granted`);
    const match = result.rows.find((row) =>
      (expectedPid === undefined || row.pid === expectedPid) &&
      row.blockedBy.length === blockers);
    if (match) {
      event(`WRITER_PID_${match.pid}_BLOCKED_BY_${blockers}_READERS`);
      return match.pid;
    }
    await new Promise((done) => setTimeout(done, 10));
  }
  throw new Error(`No exclusive advisory writer blocked by exactly ${blockers} readers.`);
}

async function connected() {
  const client = new Client({ connectionString: fixture.migrationDatabaseUrl() });
  await client.connect();
  return client;
}

describe('Issue319 additional real PostgreSQL lock and lease boundaries', () => {
  it('two real HTTP readers hold shared org locks; CA lifecycle writer waits for both', async () => {
    const a = await actor();
    const user = await fixture.createUser();
    await fixture.addMembership(a.organizationId, user.id, 'ORG_ADMIN');
    const admin = await fixture.nativeLogin(user);
    await fixture.enrollAndAssure(admin);
    const base = `/v1/staff/management/organizations/${a.organizationId}/locations/${a.locationId}`;
    const location = await fixture.query<{ updated_at: Date }>(
      'SELECT updated_at FROM locations WHERE id=$1', [a.locationId]);
    const stopped = await fixture.managementPost(`${base}/stop-intake`, admin.accessToken, {
      expectedUpdatedAt: location.rows[0]!.updated_at.toISOString(),
    });
    expect(stopped.status).toBe(201);
    const entered = latch();
    const barriers = [latch(), latch()];
    const original = dashboardAuth.authorizeDashboardReadLocation;
    let count = 0;
    vi.spyOn(dashboardAuth, 'authorizeDashboardReadLocation').mockImplementation(async (...args) => {
      const scope = await original(...args);
      if (scope && args[1].targetLocationId === a.locationId) {
        const index = count++;
        if (count === 2) entered.resolve();
        event(`LM_READER_${index}_SHARED_LOCK_HELD`);
        await barriers[index]!.promise;
      }
      return scope;
    });
    const readA = fixture.managementGet(overviewPath(a), a.auth.accessToken);
    const readB = fixture.managementGet(overviewPath(a), a.auth.accessToken);
    await entered.promise;
    const locks = await fixture.query<{ n: string }>(`SELECT count(*)::text AS n
      FROM pg_locks WHERE locktype='advisory' AND mode='ShareLock' AND granted`);
    expect(Number(locks.rows[0]?.n)).toBeGreaterThanOrEqual(2);
    event('TWO_ACTUAL_SHARED_ADVISORY_LOCKS');
    const writer = fixture.managementPost(`${base}/deactivate`, admin.accessToken, {
      expectedUpdatedAt: String(stopped.body?.updatedAt),
    });
    try {
      const writerPid = await waitForExclusiveAdvisoryWriter(2);
      barriers[0]!.resolve();
      // HTTP requests can arrive in either order; the first released barrier
      // belongs to whichever request reached authorization first.
      const firstResponse = await Promise.race([readA, readB]);
      expect(firstResponse.status).toBe(200);
      await waitForExclusiveAdvisoryWriter(1, writerPid);
      event('WRITER_STILL_BLOCKED_AFTER_ONE_READER');
      barriers[1]!.resolve();
      const [aResponse, bResponse, writerResponse] = await Promise.all([readA, readB, writer]);
      expect(aResponse.status).toBe(200);
      expect(bResponse.status).toBe(200);
      expect(writerResponse.status).toBe(201);
      expect((await fixture.managementGet(overviewPath(a), a.auth.accessToken)).status).toBe(404);
    } finally { barriers.forEach((barrier) => barrier.resolve()); }
  }, 25_000);

  it('exclusive lock for one Organization does not block another Organization reader', async () => {
    const first = await actor();
    const second = await actor();
    const gate = await connected();
    try {
      await gate.query('BEGIN');
      await gate.query(exclusive(first.organizationId));
      event('ORG_A_EXCLUSIVE_GATE_HELD');
      expect((await fixture.managementGet(overviewPath(second), second.auth.accessToken)).status).toBe(200);
      event('ORG_B_HTTP_READ_COMPLETED_UNDER_UNRELATED_GATE');
    } finally {
      await gate.query('ROLLBACK').catch(() => undefined);
      await gate.end();
    }
  });

  it.each([
    { kind: 'lock', setting: "SET LOCAL lock_timeout='250ms'", code: '55P03' },
    { kind: 'statement', setting: "SET LOCAL statement_timeout='250ms'", code: '57014' },
  ])('$kind timeout of managed reader rolls back and leaves same connection usable', async ({ setting, code }) => {
    const a = await actor();
    const gate = await connected();
    const runtimePool = new Pool({ connectionString: fixture.runtimeDatabaseUrl(), max: 1 });
    const reader = await runtimePool.connect();
    try {
      await gate.query('BEGIN');
      await gate.query(exclusive(a.organizationId));
      await reader.query('BEGIN');
      await reader.query(setting);
      const errorCode = await dashboardAuth.authorizeDashboardReadLocation(reader, {
        authenticatedUserId: a.user.id, capability: 'LOCATION_DASHBOARD_READ',
        targetLocationId: a.locationId,
      }).then(() => 'UNEXPECTED_SUCCESS', (error: { code?: string }) => error.code);
      expect(errorCode).toBe(code);
      event(`PG_ERROR_${code}_OBSERVED`);
      await reader.query('ROLLBACK');
      const locks = await reader.query<{ n: string }>(`SELECT count(*)::text AS n
        FROM pg_locks WHERE pid=pg_backend_pid() AND locktype='advisory' AND granted`);
      expect(Number(locks.rows[0]?.n)).toBe(0);
      await gate.query('COMMIT');
      await reader.query('BEGIN');
      expect(await dashboardAuth.authorizeDashboardReadLocation(reader, {
        authenticatedUserId: a.user.id, capability: 'LOCATION_DASHBOARD_READ',
        targetLocationId: a.locationId,
      })).toMatchObject({ locationId: a.locationId });
      await reader.query('COMMIT');
      event('ROLLBACK_CLEANUP_AND_FRESH_READ_PASS');
    } finally {
      await reader.query('ROLLBACK').catch(() => undefined);
      await gate.query('ROLLBACK').catch(() => undefined);
      reader.release();
      await Promise.all([runtimePool.end(), gate.end()]);
    }
  });

  it('KPI session-lock acquisition timeout discards ambiguous pooled connection', async () => {
    const a = await actor();
    const gate = await connected();
    const pool = new Pool({ connectionString: fixture.runtimeDatabaseUrl(),
      options: '-c statement_timeout=750ms', max: 1 });
    try {
      await gate.query('BEGIN');
      await gate.query(exclusive(a.organizationId));
      const pending = inAuthorizedKpiSnapshot(pool, {
        authenticatedUserId: a.user.id, locationId: a.locationId,
      }, async () => 'SHOULD_NOT_RUN');
      await waitForBlocked(1);
      await expect(pending).rejects.toMatchObject({ code: '57014' });
      event('KPI_SESSION_ADVISORY_CANCELLED_BEFORE_BEGIN');
      expect(pool.totalCount).toBe(0);
      expect(pool.waitingCount).toBe(0);
      await gate.query('COMMIT');
      expect(await inAuthorizedKpiSnapshot(pool, {
        authenticatedUserId: a.user.id, locationId: a.locationId,
      }, async (_, scope) => scope.locationId)).toBe(a.locationId);
      const advisory = await pool.query<{ n: string }>(`SELECT count(*)::text AS n
        FROM pg_locks WHERE pid=pg_backend_pid() AND locktype='advisory' AND granted`);
      expect(Number(advisory.rows[0]?.n)).toBe(0);
      event('KPI_POOL_RECOVERED_WITH_NO_ADVISORY_LOCK');
    } finally {
      await gate.query('ROLLBACK').catch(() => undefined);
      await gate.end();
      await pool.end();
    }
  });

  it('KPI action exception rolls back, releases session lock, and preserves reusable pool', async () => {
    const a = await actor();
    const pool = new Pool({ connectionString: fixture.runtimeDatabaseUrl(), max: 1 });
    try {
      await expect(inAuthorizedKpiSnapshot(pool, {
        authenticatedUserId: a.user.id, locationId: a.locationId,
      }, async () => { throw new Error('ISSUE319_SYNTHETIC_ROLLBACK'); }))
        .rejects.toThrow('ISSUE319_SYNTHETIC_ROLLBACK');
      const advisory = await pool.query<{ n: string }>(`SELECT count(*)::text AS n
        FROM pg_locks WHERE pid=pg_backend_pid() AND locktype='advisory' AND granted`);
      expect(Number(advisory.rows[0]?.n)).toBe(0);
      expect(await inAuthorizedKpiSnapshot(pool, {
        authenticatedUserId: a.user.id, locationId: a.locationId,
      }, async (_, scope) => scope.organizationId)).toBe(a.organizationId);
      event('KPI_ROLLBACK_RELEASE_AND_REUSE_SUCCEEDED');
    } finally { await pool.end(); }
  });
});
