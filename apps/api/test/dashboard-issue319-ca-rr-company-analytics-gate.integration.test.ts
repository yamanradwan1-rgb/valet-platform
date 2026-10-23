import { generate } from 'otplib';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import * as assurance from '../src/modules/auth/mfa/mfa-assurance-policy';
import * as analyticsSource from '../src/modules/management/company-analytics-source';
import { actor, event, fixture, latch, startLab, trace } from './dashboard-issue319-lab';

interface Probe { readonly pid: number; readonly isolation: string; readonly snapshot: string }

beforeAll(startLab, 180_000);
afterAll(() => fixture.stop(), 90_000);
afterEach(() => {
  vi.restoreAllMocks();
  if (trace.length) console.log('ISSUE319_COMPANY_ANALYTICS_RR_TRACE', JSON.stringify(trace.splice(0)));
});

describe('Issue #319 final gate: Company Analytics RR MFA factor retirement', () => {
  it('must not expose synthetic Company Analytics after distinct-session MFA recovery', async () => {
    const a = await actor('ORG_ADMIN', false);
    const begun = await fixture.postMfa('/v1/staff/auth/mfa/enrollment/begin', a.auth.accessToken);
    expect(begun.status).toBe(200);
    const factorId = begun.body?.factorId as unknown;
    const secret = (begun.body?.provisioning as { secretBase32?: unknown } | undefined)?.secretBase32;
    if (typeof factorId !== 'string' || typeof secret !== 'string')
      throw new Error('Synthetic MFA enrollment unavailable.');
    const now = (await fixture.query<{ now: Date }>('SELECT clock_timestamp() AS now')).rows[0]!.now;
    const code = await generate({ algorithm: 'sha1', digits: 6,
      epoch: Math.floor(now.getTime() / 30_000) * 30, period: 30,
      secret, strategy: 'totp' });
    const confirmed = await fixture.postMfa('/v1/staff/auth/mfa/enrollment/confirm',
      a.auth.accessToken, { code, factorId });
    expect(confirmed.status).toBe(200);
    const recoveryCode = (confirmed.body?.recoveryCodes as unknown[] | undefined)?.[0];
    if (typeof recoveryCode !== 'string') throw new Error('Synthetic recovery code missing.');
    const recoverySession = await fixture.nativeLogin(a.user);
    expect(recoverySession.sessionId).not.toBe(a.auth.sessionId);
    const sentinel = 'Pacific/Chatham';
    await fixture.query('UPDATE locations SET timezone=$1 WHERE id=$2', [sentinel, a.locationId]);
    const path = `/v1/staff/management/organizations/${a.organizationId}` +
      '/analytics/all-locations?from=2026-07-10&to=2026-07-10';
    const baseline = await fixture.managementGet(path, a.auth.accessToken);
    expect(baseline.status).toBe(200);
    expect(JSON.stringify(baseline.body)).toContain(sentinel);

    const entered = latch();
    const resume = latch();
    const original = assurance.requireMfaAssuranceInTransaction;
    let intercepted = false;
    let before: Probe | undefined;
    let after: Probe | undefined;
    vi.spyOn(assurance, 'requireMfaAssuranceInTransaction')
      .mockImplementation(async (...args) => {
        if (!intercepted && args[1].staffAuthSessionId === a.auth.sessionId) {
          intercepted = true;
          before = (await args[0].query<Probe>(`SELECT pg_backend_pid() AS pid,
            current_setting('transaction_isolation') AS isolation,
            txid_current_snapshot()::text AS snapshot`)).rows[0];
          event('COMPANY_ANALYTICS_RR_SNAPSHOT_BEFORE_MFA_FACTOR_CHECK');
          entered.resolve();
          await resume.promise;
          after = (await args[0].query<Probe>(`SELECT pg_backend_pid() AS pid,
            current_setting('transaction_isolation') AS isolation,
            txid_current_snapshot()::text AS snapshot`)).rows[0];
        }
        return original(...args);
      });

    const pending = fixture.managementGet(path, a.auth.accessToken);
    await entered.promise;
    let response: Awaited<typeof pending> | undefined;
    try {
      expect(before?.isolation).toBe('repeatable read');
      const held = await fixture.query<{ held: boolean; state: string }>(
        `SELECT backend_xmin IS NOT NULL AS held, state
         FROM pg_stat_activity WHERE pid=$1`, [before!.pid]);
      expect(held.rows[0]).toMatchObject({ held: true, state: 'idle in transaction' });
      const recovery = await fixture.postMfa('/v1/staff/auth/mfa/recovery/begin',
        recoverySession.accessToken, { recoveryCode });
      expect(recovery.status).toBe(200);
      const factor = await fixture.query<{ state: string }>(
        'SELECT state::text AS state FROM user_mfa_totp_factors WHERE id=$1', [factorId]);
      expect(factor.rows[0]?.state).toBe('RETIRED');
      event('CANONICAL_DISTINCT_SESSION_FACTOR_RETIREMENT_COMMITTED');
    } finally {
      resume.resolve();
      response = await pending;
    }
    expect(after).toMatchObject({ pid: before?.pid,
      isolation: 'repeatable read', snapshot: before?.snapshot });
    const exposed = JSON.stringify(response?.body ?? null).includes(sentinel);
    event(`COMPANY_ANALYTICS_RESPONSE status=${response?.status} containsSyntheticTimezone=${exposed}`);
    expect(response?.status).toBe(403);
    expect(exposed).toBe(false);
    const fresh = await fixture.managementGet(path, a.auth.accessToken);
    expect(fresh.status).toBe(403);
    expect(JSON.stringify(fresh.body)).not.toContain(sentinel);
  }, 35_000);

  it('reader-first holds the valid factor fence until canonical recovery waits and commits',
    async () => {
      const a = await actor('ORG_ADMIN', false);
      const begun = await fixture.postMfa('/v1/staff/auth/mfa/enrollment/begin', a.auth.accessToken);
      expect(begun.status).toBe(200);
      const factorId = begun.body?.factorId as unknown;
      const secret = (begun.body?.provisioning as { secretBase32?: unknown } | undefined)?.secretBase32;
      if (typeof factorId !== 'string' || typeof secret !== 'string')
        throw new Error('Synthetic MFA enrollment unavailable.');
      const now = (await fixture.query<{ now: Date }>('SELECT clock_timestamp() AS now')).rows[0]!.now;
      const code = await generate({ algorithm: 'sha1', digits: 6,
        epoch: Math.floor(now.getTime() / 30_000) * 30, period: 30,
        secret, strategy: 'totp' });
      const confirmed = await fixture.postMfa('/v1/staff/auth/mfa/enrollment/confirm',
        a.auth.accessToken, { code, factorId });
      expect(confirmed.status).toBe(200);
      const recoveryCode = (confirmed.body?.recoveryCodes as unknown[] | undefined)?.[0];
      if (typeof recoveryCode !== 'string') throw new Error('Synthetic recovery code missing.');
      const recoverySession = await fixture.nativeLogin(a.user);
      expect(recoverySession.sessionId).not.toBe(a.auth.sessionId);
      const sentinel = 'Pacific/Chatham';
      await fixture.query('UPDATE locations SET timezone=$1 WHERE id=$2', [sentinel, a.locationId]);
      const path = `/v1/staff/management/organizations/${a.organizationId}` +
        '/analytics/all-locations?from=2026-07-10&to=2026-07-10';

      const entered = latch();
      const release = latch();
      const original = analyticsSource.composeCompanyAnalyticsSources;
      let readerPid = 0;
      let intercepted = false;
      vi.spyOn(analyticsSource, 'composeCompanyAnalyticsSources')
        .mockImplementation(async (...args) => {
          if (!intercepted && args[1].organizationId === a.organizationId) {
            intercepted = true;
            readerPid = (await args[0].query<{ pid: number }>(
              'SELECT pg_backend_pid()::integer AS pid')).rows[0]!.pid;
            event(`COMPANY_ANALYTICS_FACTOR_FENCE_HELD_PID_${readerPid}`);
            entered.resolve();
            await release.promise;
          }
          return original(...args);
        });
      const reader = fixture.managementGet(path, a.auth.accessToken);
      let recovery: Promise<Awaited<ReturnType<typeof fixture.postMfa>>> | undefined;
      try {
        await Promise.race([entered.promise, new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Analytics post-fence barrier missing.')), 7_000))]);
        expect(readerPid).toBeGreaterThan(0);
        const lock = await fixture.query<{ count: string }>(
          `SELECT count(*)::text AS count FROM pg_locks
           WHERE pid=$1 AND locktype='relation' AND granted`, [readerPid]);
        expect(Number(lock.rows[0]?.count)).toBeGreaterThan(0);
        recovery = fixture.postMfa('/v1/staff/auth/mfa/recovery/begin',
          recoverySession.accessToken, { recoveryCode });
        let observedBlockers: number[] = [];
        const deadline = Date.now() + 7_000;
        while (Date.now() < deadline) {
          const waiters = await fixture.query<{ pid: number; blockers: number[] }>(
            `SELECT pid, pg_blocking_pids(pid) AS blockers FROM pg_stat_activity
             WHERE datname=current_database() AND wait_event_type='Lock'`);
          const blocked = waiters.rows.find((row) => row.blockers.includes(readerPid));
          if (blocked) { observedBlockers = blocked.blockers; break; }
          await new Promise((done) => setTimeout(done, 10));
        }
        expect(observedBlockers).toContain(readerPid);
        event(`RECOVERY_HTTP_BLOCKED_BY_READER_PID_${readerPid}`);
        release.resolve();
        const result = await reader;
        expect(result.status).toBe(200);
        expect(JSON.stringify(result.body)).toContain(sentinel);
        expect((await recovery).status).toBe(200);
        const fresh = await fixture.managementGet(path, a.auth.accessToken);
        expect(fresh.status).toBe(403);
        expect(JSON.stringify(fresh.body)).not.toContain(sentinel);
      } finally {
        release.resolve();
        await Promise.allSettled([reader, recovery].filter((promise) => promise !== undefined));
      }
    }, 35_000);
});
