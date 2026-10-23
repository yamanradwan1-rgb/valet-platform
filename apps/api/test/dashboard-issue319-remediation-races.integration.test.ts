import { Client } from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import * as physicalAuth from '../src/modules/dashboard/physical-resource-authorization';
import * as configurationProjection from '../src/modules/dashboard/dashboard-configuration-projection';
import {
  actor, event, fixture, latch, physicalPath, startLab, trace,
  type Actor,
} from './dashboard-issue319-lab';

type ReadKind = 'key-slots' | 'overview' | 'configuration';
type HttpResponse = Awaited<ReturnType<typeof fixture.managementGet>>;
type AuthenticatedAdmin = { readonly accessToken: string };

const kinds: readonly ReadKind[] = ['key-slots', 'overview', 'configuration'];

beforeAll(startLab, 180_000);
afterAll(() => fixture.stop(), 90_000);
afterEach(() => {
  vi.restoreAllMocks();
  if (trace.length) {
    console.log('ISSUE319_REMEDIATION_RACE_TRACE', JSON.stringify(trace.splice(0)));
  }
});

function pathFor(kind: ReadKind, a: Actor): string {
  return kind === 'configuration'
    ? `/v1/staff/dashboard/locations/` + a.locationId + '/configuration'
    : physicalPath(a, kind);
}

async function prepare(kind: ReadKind) {
  const manager = await actor();
  if (kind === 'configuration') {
    // Persist a unique, inspectable Company-default -> Location-override value.
    await fixture.query(
      'UPDATE organizations SET check_in_photos_required=FALSE WHERE id=$1',
      [manager.organizationId],
    );
    await fixture.query(
      'UPDATE locations SET check_in_photos_required_override=TRUE WHERE id=$1',
      [manager.locationId],
    );
  }
  const adminUser = await fixture.createUser();
  await fixture.addMembership(manager.organizationId, adminUser.id, 'ORG_ADMIN');
  const admin = await fixture.nativeLogin(adminUser);
  await fixture.enrollAndAssure(admin);
  return { manager, admin: admin as AuthenticatedAdmin };
}

async function revokeByActualHttp(a: Actor, admin: AuthenticatedAdmin) {
  const version = await fixture.query<{ version: number }>(
    'SELECT version FROM organization_memberships WHERE id=$1',
    [a.membershipId],
  );
  event('REAL_CA_MFA_REVOKE_HTTP_STARTED');
  const response = await fixture.managementPost(
    `/v1/staff/management/organizations/` + a.organizationId +
      '/staff/' + a.membershipId + '/location-access/revoke',
    admin.accessToken,
    { expectedVersion: version.rows[0]!.version, locationIds: [a.locationId] },
  );
  event('REAL_CA_MFA_REVOKE_HTTP_COMPLETED');
  expect(response.status).toBe(201);
}

function expectAuthorized(kind: ReadKind, a: Actor, response: HttpResponse) {
  expect(response.status).toBe(200);
  if (kind === 'configuration') {
    expect(response.body).toMatchObject({
      locationId: a.locationId,
      organizationId: a.organizationId,
    });
    const settings = response.body?.settings as Array<{
      setting: string;
      default: boolean;
      override: boolean;
      effective: boolean;
      overridePresent: boolean;
    }>;
    expect(settings).toHaveLength(10);
    expect(settings.find((entry) => entry.setting === 'checkInPhotosRequired'))
      .toMatchObject({
        default: false,
        override: true,
        effective: true,
        overridePresent: true,
      });
    return;
  }
  if (kind === 'overview') {
    const keySlots = response.body?.keySlots as {
      items: Array<{ keySlotId: string }>;
    };
    expect(keySlots.items).toEqual(
      expect.arrayContaining([expect.objectContaining({ keySlotId: a.keySlotId })]),
    );
    return;
  }
  expect(response.body?.items).toEqual(
    expect.arrayContaining([expect.objectContaining({ keySlotId: a.keySlotId })]),
  );
}

async function expectFreshDenied(kind: ReadKind, a: Actor) {
  const response = await fixture.managementGet(pathFor(kind, a), a.auth.accessToken);
  expect(response.status).toBe(404);
  expect(response.body).not.toHaveProperty('items');
  expect(response.body).not.toHaveProperty('settings');
  expect(response.body).not.toHaveProperty('keySlots');
}

function pauseBetweenAuthorizationAndProjection(kind: ReadKind, a: Actor) {
  const entered = latch();
  const release = latch();
  let intercepted = false;
  if (kind === 'configuration') {
    const original = configurationProjection.loadLocationConfigurationRow;
    vi.spyOn(configurationProjection, 'loadLocationConfigurationRow')
      .mockImplementation(async (...args) => {
        if (!intercepted && args[1] === a.locationId) {
          intercepted = true;
          event('CONFIG_SAVED_SETTING_PROJECTION_PAUSED');
          entered.resolve();
          await release.promise;
        }
        return original(...args);
      });
  } else {
    const original = physicalAuth.authorizePhysicalResourceManagement;
    vi.spyOn(physicalAuth, 'authorizePhysicalResourceManagement')
      .mockImplementation(async (...args) => {
        const authority = await original(...args);
        if (!intercepted && args[2] === a.locationId) {
          intercepted = true;
          event('PHYSICAL_AUTHORIZATION_RETURN_PAUSED');
          entered.resolve();
          await release.promise;
        }
        return authority;
      });
  }
  return { entered, release };
}

async function observeBlocked(minimum: number) {
  const until = Date.now() + 7_000;
  while (Date.now() < until) {
    const result = await fixture.query<{ count: string }>(`SELECT count(*)::text AS count
      FROM pg_stat_activity
      WHERE datname=current_database() AND pid<>pg_backend_pid()
        AND wait_event_type='Lock'`);
    if (Number(result.rows[0]?.count ?? 0) >= minimum) {
      event(`POSTGRES_` + minimum + '_WAITERS_CONFIRMED');
      return;
    }
    await new Promise((done) => setTimeout(done, 10));
  }
  throw new Error(`Expected ` + minimum + ' PostgreSQL lock waiter(s).');
}

describe('Issue #319 F319-01 / F319-02 real HTTP revocation races', () => {
  it.each(kinds)(
    'reader-first %s keeps the shared grant fence through real response projection',
    async (kind) => {
      const { manager, admin } = await prepare(kind);
      const pause = pauseBetweenAuthorizationAndProjection(kind, manager);
      const reader = fixture.managementGet(pathFor(kind, manager), manager.auth.accessToken);
      await pause.entered.promise;
      const writer = revokeByActualHttp(manager, admin);
      try {
        // Pre-fix: no compatible reader fence, so the writer commits without waiting.
        // Post-fix: reader-held SHARED advisory blocks the real CA HTTP writer.
        await observeBlocked(1);
        pause.release.resolve();
        const authorized = await reader;
        event('AUTHORIZED_READER_COMPLETED_BEFORE_REVOKER');
        expectAuthorized(kind, manager, authorized);
        await writer;
        await expectFreshDenied(kind, manager);
      } finally {
        pause.release.resolve();
        await Promise.allSettled([reader, writer]);
      }
    },
    25_000,
  );

  it.each(kinds)(
    'revoker-first %s waits behind real CA HTTP revocation then denies protected data',
    async (kind) => {
      const { manager, admin } = await prepare(kind);
      const gate = new Client({ connectionString: fixture.migrationDatabaseUrl() });
      await gate.connect();
      await gate.query('BEGIN');
      let writer: Promise<void> | undefined;
      let reader: Promise<HttpResponse> | undefined;
      try {
        // Exclusive, disposable-DB gate queues the genuine CA writer first.
        await gate.query(
          `SELECT pg_advisory_xact_lock(
            hashtextextended('staff-management-org:' || $1::text, 0))`,
          [manager.organizationId],
        );
        writer = revokeByActualHttp(manager, admin);
        await observeBlocked(1);
        reader = fixture.managementGet(pathFor(kind, manager), manager.auth.accessToken);
        // A fixed read also queues on the shared org fence, never projecting
        // from an old RR snapshot while the earlier exclusive writer is queued.
        await observeBlocked(2);
        await gate.query('COMMIT');
        await writer;
        const denied = await reader;
        event('READER_DENIED_AFTER_CA_REVOKE_COMMIT');
        expect(denied.status).toBe(404);
        expect(denied.body).not.toHaveProperty('items');
        expect(denied.body).not.toHaveProperty('keySlots');
        expect(denied.body).not.toHaveProperty('settings');
        await expectFreshDenied(kind, manager);
      } finally {
        await gate.query('ROLLBACK').catch(() => undefined);
        await gate.end();
        const pending = [writer, reader].filter((task) => task !== undefined);
        await Promise.allSettled(pending);
      }
    },
    25_000,
  );
});
