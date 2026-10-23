import { Client, Pool } from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import * as factorFence from '../src/modules/auth/mfa/mfa-rr-factor-fence';
import { DatabaseStaffSessionContextResolver } from '../src/modules/auth/staff-session-context';
import { inFencedCompanyAdminRrSnapshot } from '../src/modules/management/company-admin-rr-snapshot';
import { event, fixture, startLab, trace } from './dashboard-issue319-lab';
import { observedBlockedBy, preparedCompanyAdmin } from './dashboard-issue319-final-mfa-lab';

beforeAll(startLab, 180_000);
afterAll(() => fixture.stop(), 90_000);
afterEach(() => {
  vi.restoreAllMocks();
  if (trace.length) console.log('ISSUE319_FINAL_RETRY_CLEANUP_TRACE', JSON.stringify(trace.splice(0)));
});

async function snapshotPool(admin: Awaited<ReturnType<typeof preparedCompanyAdmin>>,
  options?: string) {
  const pool = new Pool({ connectionString: fixture.runtimeDatabaseUrl(), max: 1,
    ...(options === undefined ? {} : { options }) });
  try {
    const context = await new DatabaseStaffSessionContextResolver(pool)
      .resolve(`Bearer ${admin.admin.auth.accessToken}`);
    return { pool, context };
  } catch (error) { await pool.end(); throw error; }
}

async function runSnapshot(
  testPool: Awaited<ReturnType<typeof snapshotPool>>,
  organizationId: string,
  project: (transaction: Parameters<Parameters<typeof inFencedCompanyAdminRrSnapshot>[4]>[0]) => Promise<string>,
) {
  return inFencedCompanyAdminRrSnapshot(testPool.pool, testPool.context, organizationId,
    'ANALYTICS_READ', async (transaction) => project(transaction));
}

describe('Issue319 fresh RR 40001 retries and cleanup', () => {
  it.each([1, 5])('real PostgreSQL 40001 conflict count=%i uses bounded fresh snapshots',
    async (conflictAttempts) => {
      const admin = await preparedCompanyAdmin();
      const testPool = await snapshotPool(admin);
      const original = factorFence.requireCurrentMfaFactorFenceInRr;
      let calls = 0;
      const observedErrors: string[] = [];
      try {
        vi.spyOn(factorFence, 'requireCurrentMfaFactorFenceInRr')
          .mockImplementation(async (...args) => {
            calls += 1;
            if (calls <= conflictAttempts) {
              // A separately committed real UPDATE creates a newer row version
              // after this RR transaction's Management authorization snapshot.
              await fixture.query('UPDATE user_mfa_totp_factors SET activated_at=activated_at WHERE id=$1',
                [admin.factorId]);
            }
            try { return await original(...args); }
            catch (error) {
              observedErrors.push(String((error as { code?: unknown }).code));
              throw error;
            }
          });
        const project = async (tx: Parameters<Parameters<typeof inFencedCompanyAdminRrSnapshot>[4]>[0]) => {
          const result = await tx.query<{ value: string }>(
            'SELECT timezone AS value FROM locations WHERE id=$1', [admin.admin.locationId]);
          return result.rows[0]!.value;
        };
        if (conflictAttempts === 1) {
          expect(await runSnapshot(testPool, admin.admin.organizationId, project))
            .toBe('Pacific/Chatham');
          expect(calls).toBe(2);
        } else {
          await expect(runSnapshot(testPool, admin.admin.organizationId, project))
            .rejects.toMatchObject({ code: '40001' });
          expect(calls).toBe(5);
        }
        expect(observedErrors).toEqual(Array(conflictAttempts).fill('40001'));
        event(`REAL_40001_CONFLICTS_${conflictAttempts}_ATTEMPTS_${calls}`);
        vi.restoreAllMocks();
        expect(await runSnapshot(testPool, admin.admin.organizationId, project))
          .toBe('Pacific/Chatham');
        expect(testPool.pool.totalCount).toBe(1);
        expect(testPool.pool.idleCount).toBe(1);
      } finally { await testPool.pool.end(); }
    }, 40_000);

  it.each(['lock_timeout', 'cancel'])('%s while MFA factor is locked aborts and returns clean pool lease',
    async (failureKind) => {
      const admin = await preparedCompanyAdmin();
      const testPool = await snapshotPool(admin,
        failureKind === 'lock_timeout' ? '-c lock_timeout=900ms' : undefined);
      const gate = new Client({ connectionString: fixture.migrationDatabaseUrl() });
      await gate.connect();
      let begun = false;
      try {
        await gate.query('BEGIN');
        begun = true;
        await gate.query('UPDATE user_mfa_totp_factors SET activated_at=activated_at WHERE id=$1',
          [admin.factorId]);
        const pending = runSnapshot(testPool, admin.admin.organizationId,
          async () => 'UNEXPECTED_PROTECTED_READ');
        const gatePid = (await gate.query<{ pid: number }>(
          'SELECT pg_backend_pid()::int AS pid')).rows[0]!.pid;
        const blockedPid = await observedBlockedBy(gatePid);
        if (failureKind === 'cancel') {
          const canceled = await fixture.query<{ canceled: boolean }>(
            'SELECT pg_cancel_backend($1) AS canceled', [blockedPid]);
          expect(canceled.rows[0]?.canceled).toBe(true);
        }
        await expect(pending).rejects.toMatchObject({
          code: failureKind === 'cancel' ? '57014' : '55P03',
        });
        event(`FACTOR_${failureKind.toUpperCase()}_ROLLED_BACK_PID_${blockedPid}`);
        expect(testPool.pool.waitingCount).toBe(0);
        await gate.query('ROLLBACK');
        begun = false;
        expect(await runSnapshot(testPool, admin.admin.organizationId,
          async () => 'SAFE_RETRY')).toBe('SAFE_RETRY');
        const state = await testPool.pool.query<{ n: string }>(
          `SELECT count(*)::text AS n FROM pg_locks
           WHERE pid=pg_backend_pid() AND locktype='advisory' AND granted`);
        expect(Number(state.rows[0]?.n)).toBe(0);
        expect(testPool.pool.totalCount).toBe(1);
        event(`FACTOR_${failureKind.toUpperCase()}_SAFE_CONNECTION_REUSE`);
      } finally {
        if (begun) await gate.query('ROLLBACK').catch(() => undefined);
        await gate.end();
        await testPool.pool.end();
      }
    }, 40_000);

  it('unexpected projection rollback releases exclusive organization lock and allows fresh read',
    async () => {
      const admin = await preparedCompanyAdmin();
      const testPool = await snapshotPool(admin);
      try {
        await expect(runSnapshot(testPool, admin.admin.organizationId,
          async () => { throw new Error('SYNTHETIC_PROJECTOR_ABORT'); }))
          .rejects.toThrow('SYNTHETIC_PROJECTOR_ABORT');
        const state = await testPool.pool.query<{ n: string }>(
          `SELECT count(*)::text AS n FROM pg_locks
           WHERE pid=pg_backend_pid() AND locktype='advisory' AND granted`);
        expect(Number(state.rows[0]?.n)).toBe(0);
        expect(await runSnapshot(testPool, admin.admin.organizationId,
          async () => 'POST_ROLLBACK_OK')).toBe('POST_ROLLBACK_OK');
        expect(testPool.pool.waitingCount).toBe(0);
        event('CA_RR_PROJECTION_ROLLBACK_RELEASED_LOCK_AND_RETRIED');
      } finally { await testPool.pool.end(); }
    }, 40_000);
});
