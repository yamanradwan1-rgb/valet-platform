import { generate } from 'otplib';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import * as companyAuth from '../src/modules/management/management-authorization';
import {
  actor, event, fixture, latch, physicalPath, startLab, trace,
} from './dashboard-issue319-lab';

interface SnapshotProbe {
  readonly pid: number;
  readonly isolation: string;
  readonly snapshot: string;
}

interface FactorEvidence {
  readonly mfa_authenticated_at: Date | null;
  readonly mfa_factor_id: string | null;
  readonly state: 'ACTIVE' | 'PENDING' | 'RETIRED';
  readonly retired_at: Date | null;
}

beforeAll(startLab, 180_000);
afterAll(() => fixture.stop(), 90_000);
afterEach(() => {
  vi.restoreAllMocks();
  if (trace.length) {
    console.log('ISSUE319_CA_MFA_RR_CANDIDATE_TRACE', JSON.stringify(trace.splice(0)));
  }
});

async function currentTotpCode(secret: string): Promise<string> {
  const clock = await fixture.query<{ now: Date }>('SELECT clock_timestamp() AS now');
  const now = clock.rows[0]?.now;
  if (!now) throw new Error('Database clock unavailable for canonical MFA proof.');
  const step = Math.floor(now.getTime() / 30_000);
  return generate({
    algorithm: 'sha1',
    digits: 6,
    epoch: step * 30,
    period: 30,
    secret,
    strategy: 'totp',
  });
}

async function factorEvidence(sessionId: string): Promise<FactorEvidence> {
  const evidence = await fixture.query<FactorEvidence>(
    `SELECT session.mfa_authenticated_at, session.mfa_factor_id,
            factor.state::text AS state, factor.retired_at
     FROM staff_auth_sessions AS session
     JOIN user_mfa_totp_factors AS factor ON factor.id = session.mfa_factor_id
     WHERE session.id = $1`,
    [sessionId],
  );
  const row = evidence.rows[0];
  if (!row) throw new Error('Expected a persisted, MFA-assured Staff session.');
  return row;
}

describe('Issue #319 candidate: Company Admin Physical overview RR MFA factor retirement', () => {
  it('does not expose protected overview data after canonical recovery retires the factor', async () => {
    const a = await actor('ORG_ADMIN', false);
    // Confirm enrollment directly to retain the real one-time recovery code;
    // the convenience fixture otherwise discards it.
    const begun = await fixture.postMfa(
      '/v1/staff/auth/mfa/enrollment/begin',
      a.auth.accessToken,
    );
    expect(begun.status).toBe(200);
    const factorId = begun.body?.factorId as unknown;
    const provisioning = begun.body?.provisioning as
      { secretBase32?: unknown } | undefined;
    if (typeof factorId !== 'string' ||
        typeof provisioning?.secretBase32 !== 'string') {
      throw new Error('Canonical MFA enrollment provisioning missing.');
    }
    const confirmed = await fixture.postMfa(
      '/v1/staff/auth/mfa/enrollment/confirm',
      a.auth.accessToken,
      { code: await currentTotpCode(provisioning.secretBase32), factorId },
    );
    expect(confirmed.status).toBe(200);
    const codes = confirmed.body?.recoveryCodes;
    expect(Array.isArray(codes)).toBe(true);
    const code = Array.isArray(codes) ? codes[0] as unknown : undefined;
    if (typeof code !== 'string') throw new Error('Canonical recovery code unavailable.');

    const path = physicalPath(a, 'overview');
    const baseline = await fixture.managementGet(path, a.auth.accessToken);
    expect(baseline.status).toBe(200);
    expect(JSON.stringify(baseline.body?.keySlots)).toContain(a.keySlotId);
    const before = await factorEvidence(a.auth.sessionId);
    expect(before).toMatchObject({
      mfa_factor_id: factorId,
      state: 'ACTIVE',
      retired_at: null,
    });
    expect(before.mfa_authenticated_at).not.toBeNull();

    const entered = latch();
    const resume = latch();
    const original = companyAuth.eligibleCompanyAdminLocationOrganization;
    let intercepted = false;
    let beforeProbe: SnapshotProbe | undefined;
    let afterProbe: SnapshotProbe | undefined;
    vi.spyOn(companyAuth, 'eligibleCompanyAdminLocationOrganization')
      .mockImplementation(async (...args) => {
        const organizationId = await original(...args);
        if (!intercepted && args[1] === a.user.id && args[2] === a.locationId &&
            organizationId === a.organizationId) {
          intercepted = true;
          const prior = await args[0].query<SnapshotProbe>(
            `SELECT pg_backend_pid() AS pid,
                    current_setting('transaction_isolation') AS isolation,
                    txid_current_snapshot()::text AS snapshot`,
          );
          beforeProbe = prior.rows[0];
          event('CA_RR_FIRST_ELIGIBILITY_SNAPSHOT_OBSERVED');
          entered.resolve();
          await resume.promise;
          const later = await args[0].query<SnapshotProbe>(
            `SELECT pg_backend_pid() AS pid,
                    current_setting('transaction_isolation') AS isolation,
                    txid_current_snapshot()::text AS snapshot`,
          );
          afterProbe = later.rows[0];
          event('CA_RR_AUTHORIZATION_CONTINUES_AFTER_FACTOR_RETIREMENT');
        }
        return organizationId;
      });

    const pending = fixture.managementGet(path, a.auth.accessToken);
    await entered.promise;
    let inFlight: Awaited<typeof pending> | undefined;
    try {
      expect(beforeProbe?.isolation).toBe('repeatable read');
      const observed = await fixture.query<{ state: string; snapshotHeld: boolean }>(
        `SELECT state,
                backend_xmin IS NOT NULL AS "snapshotHeld"
         FROM pg_stat_activity WHERE pid = $1`,
        [beforeProbe!.pid],
      );
      expect(observed.rows[0]?.state).toBe('idle in transaction');
      expect(observed.rows[0]?.snapshotHeld).toBe(true);
      const advisory = await fixture.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM pg_locks
         WHERE pid = $1 AND locktype = 'advisory' AND granted`,
        [beforeProbe!.pid],
      );
      // This CA path has not yet reached Management's EXCLUSIVE org advisory.
      expect(Number(advisory.rows[0]?.count)).toBe(0);
      event('RR_SNAPSHOT_HELD_BEFORE_CA_ORG_ADVISORY');

      const recovery = await fixture.postMfa(
        '/v1/staff/auth/mfa/recovery/begin',
        a.auth.accessToken,
        { recoveryCode: code },
      );
      expect(recovery.status).toBe(200);
      event('CANONICAL_REAL_MFA_RECOVERY_HTTP_COMMITTED');

      // Recovery retires the factor but deliberately leaves this exact
      // session's assurance timestamp and factor reference untouched.
      const after = await factorEvidence(a.auth.sessionId);
      expect(after.state).toBe('RETIRED');
      expect(after.retired_at).not.toBeNull();
      expect(after.mfa_factor_id).toBe(before.mfa_factor_id);
      expect(after.mfa_authenticated_at).toEqual(before.mfa_authenticated_at);
      event('RETIRED_FACTOR_COMMITTED_WITH_UNCHANGED_SESSION_ASSURANCE');
    } finally {
      resume.resolve();
      inFlight = await pending;
    }

    if (!inFlight) throw new Error('In-flight CA overview response unavailable.');
    expect(afterProbe).toMatchObject({
      pid: beforeProbe?.pid,
      isolation: 'repeatable read',
      snapshot: beforeProbe?.snapshot,
    });
    // This assertion intentionally fails if the RR snapshot incorrectly
    // treats the retired factor as ACTIVE. It is evidence, not a source fix.
    const containsSyntheticKeySlot = JSON.stringify(
      inFlight.body?.keySlots ?? null,
    ).includes(a.keySlotId);
    event(
      `CA_RR_INFLIGHT_RESULT responseStatus=${inFlight.status} ` +
      `containsSyntheticKeySlot=${containsSyntheticKeySlot}`,
    );
    expect(inFlight.status).toBe(403);
    expect(inFlight.body).not.toHaveProperty('keySlots');
    expect(JSON.stringify(inFlight.body)).not.toContain(a.keySlotId);

    const fresh = await fixture.managementGet(path, a.auth.accessToken);
    expect(fresh.status).toBe(403);
    expect(JSON.stringify(fresh.body)).not.toContain(a.keySlotId);
  }, 25_000);
});
