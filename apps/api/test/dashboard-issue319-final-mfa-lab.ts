import { generate } from 'otplib';
import { expect } from 'vitest';

import { actor, fixture } from './dashboard-issue319-lab';

export async function preparedCompanyAdmin() {
  const admin = await actor('ORG_ADMIN', false);
  const begun = await fixture.postMfa(
    '/v1/staff/auth/mfa/enrollment/begin', admin.auth.accessToken);
  expect(begun.status).toBe(200);
  const factorId = begun.body?.factorId as unknown;
  const secret = (begun.body?.provisioning as { secretBase32?: unknown } | undefined)?.secretBase32;
  if (typeof factorId !== 'string' || typeof secret !== 'string')
    throw new Error('Synthetic MFA factor is unavailable.');
  const now = (await fixture.query<{ now: Date }>(
    'SELECT clock_timestamp() AS now')).rows[0]!.now;
  const code = await generate({ algorithm: 'sha1', digits: 6,
    epoch: Math.floor(now.getTime() / 30_000) * 30, period: 30,
    secret, strategy: 'totp' });
  const confirmed = await fixture.postMfa(
    '/v1/staff/auth/mfa/enrollment/confirm', admin.auth.accessToken,
    { code, factorId });
  expect(confirmed.status).toBe(200);
  const recoveryCode = (confirmed.body?.recoveryCodes as unknown[] | undefined)?.[0];
  if (typeof recoveryCode !== 'string') throw new Error('Synthetic recovery code missing.');
  const recoverySession = await fixture.nativeLogin(admin.user);
  expect(recoverySession.sessionId).not.toBe(admin.auth.sessionId);
  await fixture.query('UPDATE locations SET timezone=$1 WHERE id=$2',
    ['Pacific/Chatham', admin.locationId]);
  return { admin, factorId, recoveryCode, recoverySession };
}

export async function recoverCompanyAdmin(
  s: Awaited<ReturnType<typeof preparedCompanyAdmin>>,
) {
  const response = await fixture.postMfa('/v1/staff/auth/mfa/recovery/begin',
    s.recoverySession.accessToken, { recoveryCode: s.recoveryCode });
  expect(response.status).toBe(200);
  const factor = await fixture.query<{ state: string }>(
    'SELECT state::text AS state FROM user_mfa_totp_factors WHERE id=$1', [s.factorId]);
  expect(factor.rows[0]?.state).toBe('RETIRED');
}

export async function signalWithin(signal: Promise<void>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([signal, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Authorization barrier not reached')), 7_000);
    })]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export async function observedBlockedBy(pid: number) {
  const deadline = Date.now() + 7_000;
  while (Date.now() < deadline) {
    const waiting = await fixture.query<{ pid: number; blockers: number[] }>(
      `SELECT pid, pg_blocking_pids(pid) AS blockers FROM pg_stat_activity
       WHERE datname=current_database() AND wait_event_type='Lock'`);
    const blocked = waiting.rows.find((row) => row.blockers.includes(pid));
    if (blocked) return blocked.pid;
    await new Promise((done) => setTimeout(done, 10));
  }
  throw new Error('Canonical revoker did not expose a PostgreSQL blocker edge.');
}
