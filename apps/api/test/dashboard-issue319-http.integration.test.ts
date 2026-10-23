import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import * as physicalAuth from '../src/modules/dashboard/physical-resource-authorization';
import * as dashboardLocationAuth from '../src/modules/dashboard/dashboard-location-authorization';
import { DatabaseStaffSessionContextResolver } from '../src/modules/auth/staff-session-context';
import {
  actor, discoveryPath, event, fixture, grantWriter, latch, logout,
  overviewPath, physicalPath, startLab, trace,
} from './dashboard-issue319-lab';

beforeAll(startLab, 180_000);
afterAll(() => fixture.stop(), 90_000);
afterEach(() => {
  vi.restoreAllMocks();
  if (trace.length) console.log('ISSUE319_HTTP_TRACE', JSON.stringify(trace.splice(0)));
});

async function waitForCanonicalWriter() {
  const deadline = Date.now() + 7_000;
  while (Date.now() < deadline) {
    const result = await fixture.query<{ blocked: number }>(`SELECT count(*)::integer AS blocked
      FROM pg_stat_activity AS activity
      WHERE activity.datname=current_database() AND activity.wait_event_type='Lock'
        AND cardinality(pg_blocking_pids(activity.pid))>0
        AND EXISTS (SELECT 1 FROM pg_locks AS waiting
          WHERE waiting.pid=activity.pid AND waiting.locktype='advisory'
            AND NOT waiting.granted)`);
    if (result.rows[0]?.blocked) {
      event('CANONICAL_WRITER_ADVISORY_WAIT_PROVEN');
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Canonical revocation did not reach an observable advisory lock wait.');
}

describe('Issue319 real HTTP security boundary characterization', () => {
  it('authorized LM receives only its synthetic physical resource', async () => {
    const a = await actor();
    const result = await fixture.managementGet(physicalPath(a), a.auth.accessToken);
    expect(result.status).toBe(200);
    expect(result.body?.items).toEqual([expect.objectContaining({ keySlotId: a.keySlotId })]);
  });

  it('POST-FIX F319-01: physical list holds grant fence while canonical SQL revocation waits', async () => {
    const a = await actor();
    const entered = latch();
    const resume = latch();
    const original = physicalAuth.authorizePhysicalResourceManagement;
    vi.spyOn(physicalAuth, 'authorizePhysicalResourceManagement').mockImplementation(async (...args) => {
      const authority = await original(...args);
      event('PHYSICAL_AUTHORIZATION_COMPLETE_BEFORE_PROJECTION');
      entered.resolve();
      await resume.promise;
      event('PROTECTED_PROJECTION_RESUMED');
      return authority;
    });
    event('HTTP_READER_START');
    const pending = fixture.managementGet(physicalPath(a), a.auth.accessToken);
    await entered.promise;
    let writer: Promise<void> | undefined;
    try {
      writer = grantWriter(a);
      await waitForCanonicalWriter();
      event('CANONICAL_GRANT_WRITER_BLOCKED_BY_READER');
    } finally { resume.resolve(); }
    const result = await pending;
    event('HTTP_READER_COMPLETE');
    expect(result.status).toBe(200);
    expect(result.body?.items).toEqual([expect.objectContaining({ keySlotId: a.keySlotId })]);
    await writer;
    event('CANONICAL_GRANT_COMMITTED_AFTER_READER_FENCE');
    vi.restoreAllMocks();
    const fresh = await fixture.managementGet(physicalPath(a), a.auth.accessToken);
    expect(fresh.status).toBe(404);
    expect(fresh.body).not.toHaveProperty('items');
  });

  it('POST-FIX F319-01: real CA Staff Management HTTP revoke waits for LM physical fence', async () => {
    const a = await actor();
    const adminUser = await fixture.createUser();
    await fixture.addMembership(a.organizationId, adminUser.id, 'ORG_ADMIN');
    const adminAuth = await fixture.nativeLogin(adminUser);
    await fixture.enrollAndAssure(adminAuth);
    const version = await fixture.query<{ version: number }>(
      'SELECT version FROM organization_memberships WHERE id=$1', [a.membershipId]);
    const entered = latch();
    const resume = latch();
    const original = physicalAuth.authorizePhysicalResourceManagement;
    vi.spyOn(physicalAuth, 'authorizePhysicalResourceManagement').mockImplementation(async (...args) => {
      const authority = await original(...args);
      event('APP_WRITER_RACE_LM_AUTH_COMPLETE');
      entered.resolve();
      await resume.promise;
      event('APP_WRITER_RACE_LM_PROJECTION_RESUMES');
      return authority;
    });
    const pending = fixture.managementGet(physicalPath(a), a.auth.accessToken);
    await entered.promise;
    let revoke: Promise<Awaited<ReturnType<typeof fixture.managementPost>>> | undefined;
    try {
      event('STAFF_MANAGEMENT_HTTP_REVOKE_START');
      revoke = fixture.managementPost(
        `/v1/staff/management/organizations/${a.organizationId}/staff/${a.membershipId}/location-access/revoke`,
        adminAuth.accessToken,
        { expectedVersion: version.rows[0]!.version, locationIds: [a.locationId] },
      );
      await waitForCanonicalWriter();
      event('STAFF_MANAGEMENT_HTTP_REVOKE_LOCK_BLOCKED');
    } finally { resume.resolve(); }
    const result = await pending;
    event('LM_PHYSICAL_HTTP_COMPLETE_BEFORE_ADMIN_REVOKE_COMMIT');
    expect(result.status).toBe(200);
    expect(result.body?.items).toEqual([expect.objectContaining({ keySlotId: a.keySlotId })]);
    const revoked = await revoke!;
    expect(revoked.status).toBe(201);
    event('STAFF_MANAGEMENT_HTTP_REVOKE_COMPLETE');
    vi.restoreAllMocks();
    expect((await fixture.managementGet(physicalPath(a), a.auth.accessToken)).status).toBe(404);
  });

  it('POST-FIX F319-01: RR overview rejects grant revoked before the protected snapshot', async () => {
    const a = await actor();
    const entered = latch();
    const resume = latch();
    const original = dashboardLocationAuth.authorizeDashboardLocation;
    let intercepted = false;
    vi.spyOn(dashboardLocationAuth, 'authorizeDashboardLocation').mockImplementation(async (...args) => {
      const hint = await original(...args);
      if (!intercepted && hint?.locationId === a.locationId) {
        intercepted = true;
        event('RR_NONAUTHORITATIVE_LOCATION_HINT_BEFORE_SESSION_ADVISORY');
        entered.resolve();
        await resume.promise;
        event('RR_PRELOCK_ACQUISITION_RESUMED_AFTER_REVOKE');
      }
      return hint;
    });
    event('HTTP_READER_START');
    const pending = fixture.managementGet(physicalPath(a, 'overview'), a.auth.accessToken);
    await entered.promise;
    try { await grantWriter(a); event('CANONICAL_GRANT_COMMITTED'); }
    finally { resume.resolve(); }
    const result = await pending;
    event('HTTP_READER_COMPLETE');
    expect(result.status).toBe(404);
    expect(result.body).not.toHaveProperty('keySlots');
    vi.restoreAllMocks();
    expect((await fixture.managementGet(physicalPath(a, 'overview'), a.auth.accessToken)).status).toBe(404);
  });

  it('POST-FIX F319-02: legacy configuration GET rejects revocation after initial hint', async () => {
    const a = await actor();
    const entered = latch();
    const resume = latch();
    const original = dashboardLocationAuth.authorizeDashboardLocation;
    let intercepted = false;
    vi.spyOn(dashboardLocationAuth, 'authorizeDashboardLocation').mockImplementation(async (...args) => {
      const scope = await original(...args);
      if (!intercepted && scope?.locationId === a.locationId) {
        intercepted = true;
        event('CONFIGURATION_LM_AUTH_COMPLETE');
        entered.resolve();
        await resume.promise;
        event('CONFIGURATION_PROJECTION_RESUMED');
      }
      return scope;
    });
    const path = `/v1/staff/dashboard/locations/${a.locationId}/configuration`;
    const pending = fixture.managementGet(path, a.auth.accessToken);
    await entered.promise;
    try { await grantWriter(a); event('CANONICAL_GRANT_COMMITTED'); }
    finally { resume.resolve(); }
    const result = await pending;
    expect(result.status).toBe(404);
    expect(result.body).not.toHaveProperty('settings');
    vi.restoreAllMocks();
    expect((await fixture.managementGet(path, a.auth.accessToken)).status).toBe(404);
  });

  it.each(['overview', 'physical', 'discovery'] as const)(
    'logout committed before request denies %s at real resolver', async (kind) => {
      const a = await actor();
      await logout(a);
      const path = kind === 'overview' ? overviewPath(a) :
        kind === 'physical' ? physicalPath(a) : discoveryPath(a);
      const result = await fixture.managementGet(path, a.auth.accessToken);
      expect(result.status).toBe(401);
      expect(result.body).not.toHaveProperty('items');
    },
  );

  it.each(['overview', 'physical', 'discovery'] as const)(
    'characterizes logout after resolver but before %s transaction', async (kind) => {
      const a = await actor();
      const entered = latch();
      const resume = latch();
      const original = DatabaseStaffSessionContextResolver.prototype.resolve;
      let intercepted = false;
      vi.spyOn(DatabaseStaffSessionContextResolver.prototype, 'resolve')
        .mockImplementation(async function (this: DatabaseStaffSessionContextResolver, ...args) {
          const context = await original.apply(this, args);
          if (!intercepted && context.userId === a.user.id) {
            intercepted = true;
            event('AUTHENTICATION_RESOLUTION_COMPLETE');
            entered.resolve();
            await resume.promise;
            event('PROTECTED_TRANSACTION_START_AFTER_LOGOUT');
          }
          return context;
        });
      const path = kind === 'overview' ? overviewPath(a) :
        kind === 'physical' ? physicalPath(a) : discoveryPath(a);
      event('HTTP_READER_START');
      const pending = fixture.managementGet(path, a.auth.accessToken);
      await entered.promise;
      try { await logout(a); } finally { resume.resolve(); }
      const result = await pending;
      event('HTTP_READER_COMPLETE');
      // DEC-023 specifies immediate resolver rejection, not cancellation of
      // already-resolved reads. Preserve this distinction in audit evidence.
      expect(result.status).toBe(kind === 'discovery' ? 401 : 200);
    },
  );

  it('CA with ordinary accepted MFA succeeds; password-only CA is denied', async () => {
    const assured = await actor('ORG_ADMIN');
    const passwordOnly = await actor('ORG_ADMIN', false);
    expect((await fixture.managementGet(physicalPath(assured), assured.auth.accessToken)).status).toBe(200);
    const denied = await fixture.managementGet(physicalPath(passwordOnly), passwordOnly.auth.accessToken);
    expect(denied.status).toBe(403);
    expect(denied.body).not.toHaveProperty('items');
  });

  it.each(['VALET_EMPLOYEE', 'VALET_SUPERVISOR'] as const)('denies %s Management physical reads', async (role) => {
    const a = await actor(role);
    expect((await fixture.managementGet(physicalPath(a), a.auth.accessToken)).status).toBe(404);
  });

  it('foreign Organization, same-Organization ungranted Location and unknown UUID disclose no resources', async () => {
    const a = await actor();
    const foreign = await actor();
    const ungranted = await fixture.addLocation(a.organizationId);
    for (const locationId of [foreign.locationId, ungranted.locationId, '00000000-0000-4000-8000-000000000001']) {
      const result = await fixture.managementGet(physicalPath({ ...a, locationId }), a.auth.accessToken);
      expect(result.status).toBe(404);
      expect(result.body).not.toHaveProperty('items');
    }
  });

  it.each(['membership', 'user', 'organization', 'location', 'expired'] as const)(
    'denies physical read when %s is ineligible before request', async (kind) => {
      const a = await actor();
      if (kind === 'membership') await fixture.query("UPDATE organization_memberships SET status='INACTIVE' WHERE id=$1", [a.membershipId]);
      if (kind === 'user') await fixture.query("UPDATE users SET status='DISABLED' WHERE id=$1", [a.user.id]);
      if (kind === 'organization') await fixture.query("UPDATE organizations SET status='INACTIVE' WHERE id=$1", [a.organizationId]);
      if (kind === 'location') await fixture.query("UPDATE locations SET status='INACTIVE',accepting_intake=false WHERE id=$1", [a.locationId]);
      if (kind === 'expired') await fixture.query("UPDATE staff_auth_sessions SET access_expires_at=created_at+interval '1 millisecond' WHERE id=$1", [a.auth.sessionId]);
      const result = await fixture.managementGet(physicalPath(a), a.auth.accessToken);
      expect(result.status).toBe(['user', 'expired'].includes(kind) ? 401 : 404);
      expect(result.body).not.toHaveProperty('items');
    },
  );

  it('fresh scope-discovery after canonical grant removal omits Location', async () => {
    const a = await actor();
    await grantWriter(a);
    const result = await fixture.managementGet(discoveryPath(a), a.auth.accessToken);
    expect(result.status).toBe(200);
    expect(result.body?.items).toEqual([]);
  });
});
