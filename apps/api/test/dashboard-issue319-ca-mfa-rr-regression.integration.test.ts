import { generate } from 'otplib';
import { Client } from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import * as overviewProjection from '../src/modules/dashboard/physical-resource-overview-query';
import {
  actor, event, fixture, latch, physicalPath, startLab, trace, type Actor,
} from './dashboard-issue319-lab';

type Response = Awaited<ReturnType<typeof fixture.managementGet>>;
type StaffLogin = Awaited<ReturnType<typeof fixture.nativeLogin>>;
type Waiter = {
  readonly pid: number;
  readonly blockers: number[];
  readonly locktype: string;
  readonly mode: string;
};

beforeAll(startLab, 180_000);
afterAll(() => fixture.stop(), 90_000);
afterEach(() => {
  vi.restoreAllMocks();
  if (trace.length) {
    console.log('ISSUE319_CA_MFA_RR_REGRESSION_TRACE', JSON.stringify(trace.splice(0)));
  }
});

async function totpCode(secret: string) {
  const clock = await fixture.query<{ now: Date }>('SELECT clock_timestamp() AS now');
  const step = Math.floor(clock.rows[0]!.now.getTime() / 30_000);
  return generate({
    algorithm: 'sha1', digits: 6, epoch: step * 30,
    period: 30, secret, strategy: 'totp',
  });
}

function assertOverview(response: Response, keySlotId: string) {
  expect(response.status).toBe(200);
  expect(JSON.stringify(response.body?.keySlots)).toContain(keySlotId);
}

function assertNoOverviewLeak(response: Response, keySlotId: string) {
  expect(response.status).toBe(403);
  expect(response.body).not.toHaveProperty('keySlots');
  expect(JSON.stringify(response.body)).not.toContain(keySlotId);
}

async function prepare() {
  const admin = await actor('ORG_ADMIN', false);
  const begin = await fixture.postMfa(
    '/v1/staff/auth/mfa/enrollment/begin', admin.auth.accessToken);
  expect(begin.status).toBe(200);
  const factorId = begin.body?.factorId as unknown;
  const provisioning = begin.body?.provisioning as
    { secretBase32?: unknown } | undefined;
  if (typeof factorId !== 'string' ||
      typeof provisioning?.secretBase32 !== 'string') {
    throw new Error('Canonical TOTP provisioning is unavailable.');
  }
  const confirmation = await fixture.postMfa(
    '/v1/staff/auth/mfa/enrollment/confirm', admin.auth.accessToken,
    { factorId, code: await totpCode(provisioning.secretBase32) });
  expect(confirmation.status).toBe(200);
  const recoveryCodes = confirmation.body?.recoveryCodes;
  const code = Array.isArray(recoveryCodes) ? recoveryCodes[0] as unknown : undefined;
  if (typeof code !== 'string') throw new Error('Canonical recovery code is missing.');

  // Recovery from a second session avoids confusing exact-session row locks
  // with the user-wide factor revocation boundary under test.
  const recoverySession = await fixture.nativeLogin(admin.user);
  expect(recoverySession.sessionId).not.toBe(admin.auth.sessionId);
  const beforeAdmin = (await fixture.sessionSnapshot(admin.auth.sessionId)).rows[0]!;
  const beforeRecovery = (await fixture.sessionSnapshot(recoverySession.sessionId)).rows[0]!;
  expect(beforeAdmin.mfa_factor_id).toBe(factorId);
  expect(beforeAdmin.mfa_authenticated_at).not.toBeNull();
  expect(beforeRecovery.mfa_factor_id).toBeNull();
  expect(beforeRecovery.mfa_authenticated_at).toBeNull();

  const path = physicalPath(admin, 'overview');
  assertOverview(await fixture.managementGet(path, admin.auth.accessToken), admin.keySlotId);
  assertNoOverviewLeak(
    await fixture.managementGet(path, recoverySession.accessToken), admin.keySlotId);
  return { admin, beforeAdmin, code, factorId, path, recoverySession };
}

async function recoveryByHttp(recoverySession: StaffLogin, code: string) {
  event('CA_FACTOR_RECOVERY_REAL_HTTP_STARTED');
  const response = await fixture.postMfa(
    '/v1/staff/auth/mfa/recovery/begin', recoverySession.accessToken,
    { recoveryCode: code });
  event('CA_FACTOR_RECOVERY_REAL_HTTP_COMMITTED');
  expect(response.status).toBe(200);
}

async function assertRetired(
  admin: Actor,
  factorId: string,
  original: { mfa_authenticated_at: Date | null; mfa_factor_id: string | null },
  recoverySession: StaffLogin,
  path: string,
) {
  const factors = await fixture.factors(admin.user.id);
  expect(factors.rows.find((row) => row.id === factorId)?.state).toBe('RETIRED');
  const currentAdmin = (await fixture.sessionSnapshot(admin.auth.sessionId)).rows[0]!;
  const currentRecovery = (await fixture.sessionSnapshot(recoverySession.sessionId)).rows[0]!;
  // Recovery retires the user-wide factor; it does not fabricate session
  // revocation or transfer assurance to the recovery session.
  expect(currentAdmin.revoked_at).toBeNull();
  expect(currentAdmin.mfa_factor_id).toBe(original.mfa_factor_id);
  expect(currentAdmin.mfa_authenticated_at).toEqual(original.mfa_authenticated_at);
  expect(currentRecovery.mfa_factor_id).toBeNull();
  expect(currentRecovery.mfa_authenticated_at).toBeNull();
  assertNoOverviewLeak(
    await fixture.managementGet(path, admin.auth.accessToken), admin.keySlotId);
  assertNoOverviewLeak(
    await fixture.managementGet(path, recoverySession.accessToken), admin.keySlotId);
}

async function blocked(check: (waiters: Waiter[]) => boolean): Promise<Waiter[]> {
  const deadline = Date.now() + 7_000;
  while (Date.now() < deadline) {
    const result = await fixture.query<Waiter>(`SELECT DISTINCT activity.pid,
      pg_blocking_pids(activity.pid) AS blockers, waiting.locktype, waiting.mode
      FROM pg_stat_activity AS activity
      INNER JOIN pg_locks AS waiting ON waiting.pid=activity.pid
      WHERE activity.datname=current_database() AND activity.wait_event_type='Lock'
        AND NOT waiting.granted`);
    const waiters = result.rows.filter((row) => row.blockers.length > 0);
    if (check(waiters)) return waiters;
    await new Promise((done) => setTimeout(done, 10));
  }
  throw new Error('Expected PostgreSQL pg_blocking_pids lock edge was not observed.');
}

async function waitForBarrier(signal: Promise<void>) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([signal, new Promise<never>((_, reject) => {
      timeout = setTimeout(() => reject(new Error('CA post-fence hook not reached.')), 7_000);
    })]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

function pauseAfterFactorFence(a: Actor) {
  const entered = latch();
  const release = latch();
  let readerPid: number | undefined;
  let intercepted = false;
  const original = overviewProjection.readPhysicalResourceOverview;
  vi.spyOn(overviewProjection, 'readPhysicalResourceOverview')
    .mockImplementation(async (...args) => {
      if (!intercepted && args[1].organizationId === a.organizationId &&
          args[1].locationId === a.locationId && args[1].role === 'ORG_ADMIN') {
        intercepted = true;
        const identity = await args[0].query<{ pid: number }>(
          'SELECT pg_backend_pid()::integer AS pid');
        readerPid = identity.rows[0]!.pid;
        event(`CA_RR_FACTOR_SHARE_FENCE_HELD_BY_PID_${readerPid}`);
        entered.resolve();
        await release.promise;
      }
      return original(...args);
    });
  return { entered, release, pid: () => readerPid };
}

describe('Issue #319 F319-05 Company Admin RR MFA factor recovery', () => {
  it('reader-first holds MFA authority through protected RR overview projection',
    async () => {
      const s = await prepare();
      const barrier = pauseAfterFactorFence(s.admin);
      const reader = fixture.managementGet(s.path, s.admin.auth.accessToken);
      let writer: Promise<void> | undefined;
      try {
        await waitForBarrier(barrier.entered.promise);
        const readerPid = barrier.pid();
        expect(readerPid).toBeGreaterThan(0);
        writer = recoveryByHttp(s.recoverySession, s.code);
        const waiters = await blocked((rows) => rows.some((row) =>
          row.blockers.includes(readerPid!)));
        event(`CA_MFA_RECOVERY_BLOCKED_BY_READER_${readerPid}_PG_${waiters[0]!.pid}`);
        barrier.release.resolve();
        assertOverview(await reader, s.admin.keySlotId);
        await writer;
        await assertRetired(s.admin, s.factorId, s.beforeAdmin,
          s.recoverySession, s.path);
      } finally {
        barrier.release.resolve();
        await Promise.allSettled([reader, writer].filter((task) => task !== undefined));
      }
    }, 25_000);

  it('revoker-first commits recovery before CA factor recheck and denies stale RR data',
    async () => {
      const s = await prepare();
      const gate = new Client({ connectionString: fixture.migrationDatabaseUrl() });
      await gate.connect();
      let writer: Promise<void> | undefined;
      let reader: Promise<Response> | undefined;
      try {
        await gate.query('BEGIN');
        // A disposable owner SHARED factor row gate queues recovery's
        // UPDATE before the CA RR reader's later FOR SHARE of that factor.
        const held = await gate.query<{ pid: number }>(
          `SELECT pg_backend_pid()::integer AS pid, factor.id
           FROM user_mfa_totp_factors AS factor
           WHERE factor.id=$1 FOR SHARE OF factor`,
          [s.factorId]);
        const gatePid = held.rows[0]!.pid;
        writer = recoveryByHttp(s.recoverySession, s.code);
        const waitingWriter = await blocked((rows) => rows.some((row) =>
          row.blockers.includes(gatePid)));
        const writerPid = waitingWriter.find((row) =>
          row.blockers.includes(gatePid))!.pid;
        event(`CA_MFA_RECOVERY_PID_${writerPid}_QUEUED_BEHIND_${gatePid}`);
        reader = fixture.managementGet(s.path, s.admin.auth.accessToken);
        await blocked((rows) => rows.some((row) =>
          row.pid !== writerPid &&
          (row.blockers.includes(writerPid) || row.blockers.includes(gatePid))));
        event('CA_RR_FACTOR_SHARE_QUEUED_BEHIND_RECOVERY_UPDATE');
        await gate.query('COMMIT');
        await writer;
        assertNoOverviewLeak(await reader, s.admin.keySlotId);
        await assertRetired(s.admin, s.factorId, s.beforeAdmin,
          s.recoverySession, s.path);
      } finally {
        await gate.query('ROLLBACK').catch(() => undefined);
        await gate.end();
        await Promise.allSettled([writer, reader].filter((task) => task !== undefined));
      }
    }, 25_000);
});
