import { generate } from 'otplib';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import * as companyAuth from '../src/modules/management/management-authorization';
import { actor, event, fixture, latch, startLab, trace } from './dashboard-issue319-lab';

interface Probe {
  readonly pid: number;
  readonly isolation: string;
  readonly snapshot: string;
}

beforeAll(startLab, 180_000);
afterAll(() => fixture.stop(), 90_000);
afterEach(() => {
  vi.restoreAllMocks();
  if (trace.length) console.log('ISSUE319_CA_KPI_RR_TRACE', JSON.stringify(trace.splice(0)));
});

describe('Issue #319 final gate: Company Admin KPI RR factor retirement', () => {
  it('must not return synthetic KPI projection after committed recovery of its assured factor', async () => {
    const a = await actor('ORG_ADMIN', false);
    const begun = await fixture.postMfa('/v1/staff/auth/mfa/enrollment/begin', a.auth.accessToken);
    expect(begun.status).toBe(200);
    const factorId = begun.body?.factorId as unknown;
    const secret = (begun.body?.provisioning as { secretBase32?: unknown } | undefined)?.secretBase32;
    if (typeof factorId !== 'string' || typeof secret !== 'string') {
      throw new Error('Canonical MFA enrollment unavailable.');
    }
    const dbNow = await fixture.query<{ now: Date }>('SELECT clock_timestamp() AS now');
    const step = Math.floor(dbNow.rows[0]!.now.getTime() / 30_000);
    const code = await generate({ algorithm: 'sha1', digits: 6, epoch: step * 30,
      period: 30, secret, strategy: 'totp' });
    const confirmed = await fixture.postMfa('/v1/staff/auth/mfa/enrollment/confirm',
      a.auth.accessToken, { code, factorId });
    if (confirmed.status !== 200) {
      console.log('KPI_MFA_FIXTURE_CONFIRM_REJECTED', confirmed.status,
        (confirmed.body as { code?: unknown } | undefined)?.code);
    }
    expect(confirmed.status).toBe(200);
    const recoveryCode = (confirmed.body?.recoveryCodes as unknown[] | undefined)?.[0];
    if (typeof recoveryCode !== 'string') throw new Error('Canonical recovery fixture unavailable.');
    const recoverySession = await fixture.nativeLogin(a.user);
    expect(recoverySession.sessionId).not.toBe(a.auth.sessionId);

    const sentinel = 'Pacific/Chatham';
    await fixture.query('UPDATE locations SET timezone=$1 WHERE id=$2', [sentinel, a.locationId]);
    const path = `/v1/staff/dashboard/locations/${a.locationId}/analytics/kpis?from=2026-07-10&to=2026-07-10`;
    const baseline = await fixture.managementGet(path, a.auth.accessToken);
    expect(baseline.status).toBe(200);
    expect(baseline.body?.timezone).toBe(sentinel);

    const entered = latch();
    const resume = latch();
    const original = companyAuth.eligibleCompanyAdminLocationOrganization;
    let intercepted = false;
    let before: Probe | undefined;
    let after: Probe | undefined;
    vi.spyOn(companyAuth, 'eligibleCompanyAdminLocationOrganization')
      .mockImplementation(async (...args) => {
        const org = await original(...args);
        if (!intercepted && args[1] === a.user.id && args[2] === a.locationId &&
            org === a.organizationId) {
          intercepted = true;
          before = (await args[0].query<Probe>(`SELECT pg_backend_pid() AS pid,
            current_setting('transaction_isolation') AS isolation,
            txid_current_snapshot()::text AS snapshot`)).rows[0];
          event('KPI_RR_AUTH_SNAPSHOT_BEFORE_FACTOR_CHECK');
          entered.resolve();
          await resume.promise;
          after = (await args[0].query<Probe>(`SELECT pg_backend_pid() AS pid,
            current_setting('transaction_isolation') AS isolation,
            txid_current_snapshot()::text AS snapshot`)).rows[0];
        }
        return org;
      });

    const pending = fixture.managementGet(path, a.auth.accessToken);
    await entered.promise;
    let response: Awaited<typeof pending> | undefined;
    try {
      expect(before?.isolation).toBe('repeatable read');
      const held = await fixture.query<{ snapshotHeld: boolean; state: string }>(
        `SELECT backend_xmin IS NOT NULL AS "snapshotHeld", state
         FROM pg_stat_activity WHERE pid=$1`, [before!.pid]);
      expect(held.rows[0]).toMatchObject({ snapshotHeld: true, state: 'idle in transaction' });
      const recovery = await fixture.postMfa('/v1/staff/auth/mfa/recovery/begin',
        recoverySession.accessToken, { recoveryCode });
      expect(recovery.status).toBe(200);
      const factor = await fixture.query<{ state: string }>(
        'SELECT state::text AS state FROM user_mfa_totp_factors WHERE id=$1', [factorId]);
      expect(factor.rows[0]?.state).toBe('RETIRED');
      event('CANONICAL_DISTINCT_SESSION_RECOVERY_COMMITTED');
    } finally {
      resume.resolve();
      response = await pending;
    }

    expect(after).toMatchObject({ pid: before?.pid,
      isolation: 'repeatable read', snapshot: before?.snapshot });
    const leaked = response?.body?.timezone === sentinel;
    event(`KPI_RR_RESPONSE status=${response?.status} containsSyntheticTimezone=${leaked}`);
    expect(response?.status).toBe(403);
    expect(leaked).toBe(false);
    const fresh = await fixture.managementGet(path, a.auth.accessToken);
    expect(fresh.status).toBe(403);
    expect(fresh.body?.timezone).not.toBe(sentinel);
  }, 35_000);
});
