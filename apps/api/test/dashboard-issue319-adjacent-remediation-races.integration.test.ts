import { Client } from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import * as locationAuth from '../src/modules/dashboard/dashboard-location-authorization';
import {
  actor, event, fixture, latch, startLab, trace, type Actor,
} from './dashboard-issue319-lab';

type Kind = 'branding' | 'subscription';
type Response = Awaited<ReturnType<typeof fixture.managementGet>>;
type Admin = { readonly accessToken: string };
type Waiting = {
  readonly pid: number;
  readonly blockers: number[];
  readonly mode: string;
};

const kinds: readonly Kind[] = ['branding', 'subscription'];

beforeAll(startLab, 180_000);
afterAll(() => fixture.stop(), 90_000);
afterEach(() => {
  vi.restoreAllMocks();
  if (trace.length) {
    console.log('ISSUE319_ADJACENT_REMEDIATION_RACE_TRACE', JSON.stringify(trace.splice(0)));
  }
});

const pathFor = (kind: Kind, a: Actor) =>
  `/v1/staff/dashboard/locations/${a.locationId}/${kind}`;

function assertProjected(kind: Kind, a: Actor, sentinel: string, response: Response) {
  expect(response.status).toBe(200);
  expect(response.body?.locationId).toBe(a.locationId);
  if (kind === 'branding') {
    expect(response.body?.displayName).toMatchObject({
      default: sentinel, effective: sentinel, override: null, overridePresent: false,
    });
  } else {
    expect(response.body?.organizationId).toBe(a.organizationId);
    expect(response.body?.subscription).toMatchObject({
      planCode: sentinel,
      status: 'ACTIVE',
      entitlements: { basicBranding: true, dashboardAccess: true, reportExports: true },
    });
  }
}

function assertDenied(response: Response, sentinel: string) {
  expect(response.status).toBe(404);
  expect(JSON.stringify(response.body)).not.toContain(sentinel);
  expect(response.body).not.toHaveProperty('displayName');
  expect(response.body).not.toHaveProperty('subscription');
  expect(response.body).not.toHaveProperty('organizationId');
}

async function prepare(kind: Kind) {
  const manager = await actor();
  const tag = manager.locationId.replaceAll('-', '').slice(0, 12).toUpperCase();
  const sentinel = kind === 'branding' ? `ISSUE319_BRAND_${tag}` : `ISSUE319_SUB_${tag}`;
  if (kind === 'branding') {
    await fixture.query('UPDATE organizations SET name=$2 WHERE id=$1',
      [manager.organizationId, sentinel]);
  } else {
    await fixture.query('UPDATE organization_subscriptions SET plan_code=$2 WHERE organization_id=$1',
      [manager.organizationId, sentinel]);
  }
  const adminUser = await fixture.createUser();
  await fixture.addMembership(manager.organizationId, adminUser.id, 'ORG_ADMIN');
  const admin = await fixture.nativeLogin(adminUser);
  await fixture.enrollAndAssure(admin);
  assertProjected(kind, manager, sentinel,
    await fixture.managementGet(pathFor(kind, manager), manager.auth.accessToken));
  return { manager, admin: admin as Admin, sentinel };
}

async function revokeByHttp(a: Actor, admin: Admin) {
  const version = await fixture.query<{ version: number }>(
    'SELECT version FROM organization_memberships WHERE id=$1', [a.membershipId]);
  event('ADJACENT_CA_MFA_HTTP_REVOKE_STARTED');
  const response = await fixture.managementPost(
    `/v1/staff/management/organizations/${a.organizationId}` +
      `/staff/${a.membershipId}/location-access/revoke`,
    admin.accessToken,
    { expectedVersion: version.rows[0]!.version, locationIds: [a.locationId] },
  );
  event('ADJACENT_CA_MFA_HTTP_REVOKE_COMMITTED');
  expect(response.status).toBe(201);
}

async function blockedAdvisory(check: (waiters: Waiting[]) => boolean): Promise<Waiting[]> {
  const deadline = Date.now() + 7_000;
  while (Date.now() < deadline) {
    const result = await fixture.query<Waiting>(`SELECT DISTINCT activity.pid,
      pg_blocking_pids(activity.pid) AS blockers, waiting.mode
      FROM pg_stat_activity AS activity
      INNER JOIN pg_locks AS waiting ON waiting.pid=activity.pid
      WHERE activity.datname=current_database()
        AND activity.wait_event_type='Lock'
        AND waiting.locktype='advisory' AND NOT waiting.granted`);
    const waiters = result.rows.filter((row) => row.blockers.length > 0);
    if (check(waiters)) return waiters;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Expected pg_blocking_pids advisory dependency was not observed.');
}

async function awaitBarrier(promise: Promise<void>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([promise, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Post-fence hook was not reached.')), 7_000);
    })]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function pauseAfterSharedFence(kind: Kind, a: Actor) {
  const entered = latch();
  const release = latch();
  const original = locationAuth.authorizeDashboardLocation;
  let calls = 0;
  let readerPid: number | undefined;
  vi.spyOn(locationAuth, 'authorizeDashboardLocation').mockImplementation(async (...args) => {
    const scope = await original(...args);
    if (scope?.locationId === a.locationId && ++calls === 2) {
      // Both adjacent read services reauthorize AFTER the shared org lock.
      const identity = await args[0].query<{ pid: number }>(
        'SELECT pg_backend_pid()::integer AS pid');
      readerPid = identity.rows[0]!.pid;
      event(`ADJACENT_${kind.toUpperCase()}_POST_FENCE_PID_${readerPid}`);
      entered.resolve();
      await release.promise;
    }
    return scope;
  });
  return { entered, release, pid: () => readerPid };
}

async function expectFreshDenied(kind: Kind, a: Actor, sentinel: string) {
  assertDenied(await fixture.managementGet(pathFor(kind, a), a.auth.accessToken), sentinel);
}

describe('Issue #319 adjacent Branding and Subscription revocation serialization', () => {
  it.each(kinds)('reader-first %s retains a shared fence through projection',
    async (kind) => {
      const { manager, admin, sentinel } = await prepare(kind);
      const barrier = pauseAfterSharedFence(kind, manager);
      const reader = fixture.managementGet(pathFor(kind, manager), manager.auth.accessToken);
      let writer: Promise<void> | undefined;
      try {
        await awaitBarrier(barrier.entered.promise);
        const readerPid = barrier.pid();
        expect(readerPid).toBeGreaterThan(0);
        writer = revokeByHttp(manager, admin);
        const waiters = await blockedAdvisory((rows) => rows.some((row) =>
          row.mode === 'ExclusiveLock' && row.blockers.includes(readerPid!)));
        const waitingWriter = waiters.find((row) =>
          row.mode === 'ExclusiveLock' && row.blockers.includes(readerPid!));
        event(`ADJACENT_CA_WRITER_PID_${waitingWriter!.pid}_BLOCKED_BY_${readerPid}`);
        barrier.release.resolve();
        assertProjected(kind, manager, sentinel, await reader);
        event('ADJACENT_AUTHORIZED_READER_PROJECTED_BEFORE_REVOKER');
        await writer;
        await expectFreshDenied(kind, manager, sentinel);
      } finally {
        barrier.release.resolve();
        await Promise.allSettled([reader, writer].filter((task) => task !== undefined));
      }
    }, 25_000);

  it.each(kinds)('revoker-first %s denies after the queued CA HTTP commit',
    async (kind) => {
      const { manager, admin, sentinel } = await prepare(kind);
      const gate = new Client({ connectionString: fixture.migrationDatabaseUrl() });
      await gate.connect();
      let writer: Promise<void> | undefined;
      let reader: Promise<Response> | undefined;
      try {
        await gate.query('BEGIN');
        const held = await gate.query<{ pid: number }>(
          `SELECT pg_backend_pid()::integer AS pid,
             pg_advisory_xact_lock(hashtextextended('staff-management-org:' || $1::text,0))`,
          [manager.organizationId]);
        const gatePid = held.rows[0]!.pid;
        writer = revokeByHttp(manager, admin);
        const first = await blockedAdvisory((rows) => rows.some((row) =>
          row.mode === 'ExclusiveLock' && row.blockers.includes(gatePid)));
        const writerPid = first.find((row) =>
          row.mode === 'ExclusiveLock' && row.blockers.includes(gatePid))!.pid;
        event(`ADJACENT_CA_WRITER_PID_${writerPid}_QUEUED_BEHIND_${gatePid}`);
        reader = fixture.managementGet(pathFor(kind, manager), manager.auth.accessToken);
        const both = await blockedAdvisory((rows) =>
          rows.some((row) => row.pid === writerPid && row.blockers.includes(gatePid)) &&
          rows.some((row) => row.pid !== writerPid && row.mode === 'ShareLock' &&
            (row.blockers.includes(writerPid) || row.blockers.includes(gatePid))));
        expect(new Set(both.map((row) => row.pid)).size).toBeGreaterThanOrEqual(2);
        event('ADJACENT_READER_SHARED_FENCE_QUEUED_AFTER_CA_WRITER');
        await gate.query('COMMIT');
        await writer;
        assertDenied(await reader, sentinel);
        event('ADJACENT_REVOKER_COMMITTED_BEFORE_DENIED_READER');
        await expectFreshDenied(kind, manager, sentinel);
      } finally {
        await gate.query('ROLLBACK').catch(() => undefined);
        await gate.end();
        await Promise.allSettled([writer, reader].filter((task) => task !== undefined));
      }
    }, 25_000);
});
