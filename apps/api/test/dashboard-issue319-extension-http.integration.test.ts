import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import * as physicalAuth from '../src/modules/dashboard/physical-resource-authorization';
import * as companyAuth from '../src/modules/management/management-authorization';
import * as sessionRecheck from '../src/modules/auth/staff-session-revalidation';
import { DatabaseStaffSessionContextResolver } from '../src/modules/auth/staff-session-context';
import {
  actor, discoveryPath, event, fixture, grantWriter, latch,
  overviewPath, physicalPath, startLab, trace,
} from './dashboard-issue319-lab';

beforeAll(startLab, 180_000);
afterAll(() => fixture.stop(), 90_000);
afterEach(() => {
  vi.restoreAllMocks();
  if (trace.length) console.log('ISSUE319_EXTENSION_HTTP_TRACE', JSON.stringify(trace.splice(0)));
});

function pauseAfterResolver(userId: string) {
  const entered = latch();
  const resume = latch();
  const original = DatabaseStaffSessionContextResolver.prototype.resolve;
  let intercepted = false;
  vi.spyOn(DatabaseStaffSessionContextResolver.prototype, 'resolve')
    .mockImplementation(async function (this: DatabaseStaffSessionContextResolver, ...args) {
      const context = await original.apply(this, args);
      if (!intercepted && context.userId === userId) {
        intercepted = true;
        event('STAFF_RESOLVER_COMPLETE');
        entered.resolve();
        await resume.promise;
        event('STAFF_AUTH_CONTINUES_AFTER_ROTATION');
      }
      return context;
    });
  return { entered, resume };
}

async function waitForCanonicalWriter() {
  const until = Date.now() + 7_000;
  while (Date.now() < until) {
    const result = await fixture.query<{ blocked: number }>(`SELECT count(*)::integer AS blocked
      FROM pg_stat_activity AS activity
      WHERE activity.datname=current_database() AND activity.wait_event_type='Lock'
        AND cardinality(pg_blocking_pids(activity.pid))>0
        AND EXISTS (SELECT 1 FROM pg_locks AS waiting
          WHERE waiting.pid=activity.pid AND waiting.locktype='advisory'
            AND NOT waiting.granted)`);
    if (result.rows[0]?.blocked) {
      event('CANONICAL_WRITER_WAITING_FOR_VALID_READ_FENCE');
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Expected canonical writer PostgreSQL advisory wait not observed.');
}

describe('Issue319 additional real HTTP revocation interleavings', () => {
  it('scope discovery rechecks current grant after its locked Staff session recheck', async () => {
    const a = await actor();
    const entered = latch();
    const resume = latch();
    const original = sessionRecheck.lockAndRecheckStaffSessionContext;
    let intercepted = false;
    vi.spyOn(sessionRecheck, 'lockAndRecheckStaffSessionContext').mockImplementation(async (...args) => {
      const session = await original(...args);
      if (!intercepted && args[1].userId === a.user.id) {
        intercepted = true;
        event('DISCOVERY_SESSION_RECHECK_COMPLETE');
        entered.resolve();
        await resume.promise;
        event('DISCOVERY_GRANT_SELECT_RESUMES');
      }
      return session;
    });
    const pending = fixture.managementGet(discoveryPath(a), a.auth.accessToken);
    await entered.promise;
    try { await grantWriter(a); event('DISCOVERY_CANONICAL_REVOKE_COMMITTED'); }
    finally { resume.resolve(); }
    const result = await pending;
    expect(result.status).toBe(200);
    expect(result.body?.items).toEqual([]);
  });

  it.each(['parking-spots', 'parking-zones', 'key-label', 'spot-label', 'custody'] as const)(
    'physical %s holds authorization fence until protected projection completes', async (kind) => {
      const a = await actor();
      const zoneId = randomUUID();
      const spotId = randomUUID();
      await fixture.query(`INSERT INTO parking_zones
        (id,organization_id,location_id,code,label,status,updated_at)
        VALUES ($1,$2,$3,'319-Z','Issue319 Synthetic Zone','ACTIVE',clock_timestamp())`,
      [zoneId, a.organizationId, a.locationId]);
      await fixture.query(`INSERT INTO parking_spots
        (id,organization_id,location_id,parking_zone_id,code,label,status,updated_at)
        VALUES ($1,$2,$3,$4,'319-P','Issue319 Synthetic Spot','ACTIVE',clock_timestamp())`,
      [spotId, a.organizationId, a.locationId, zoneId]);
      const suffix = kind === 'key-label' ? `key-slots/${a.keySlotId}/label`
        : kind === 'spot-label' ? `parking-spots/${spotId}/label`
          : kind === 'custody' ? `key-slots/${a.keySlotId}/custody` : kind;
      const entered = latch();
      const resume = latch();
      const original = physicalAuth.authorizePhysicalResourceManagement;
      let intercepted = false;
      vi.spyOn(physicalAuth, 'authorizePhysicalResourceManagement').mockImplementation(async (...args) => {
        const authorized = await original(...args);
        if (!intercepted && args[2] === a.locationId) {
          intercepted = true;
          event(`PHYSICAL_${kind}_AUTH_COMPLETE`);
          entered.resolve();
          await resume.promise;
          event(`PHYSICAL_${kind}_PROJECTION_RESUMES`);
        }
        return authorized;
      });
      const path = physicalPath(a, suffix);
      const pending = fixture.managementGet(path, a.auth.accessToken);
      await entered.promise;
      let writer: Promise<void> | undefined;
      try {
        writer = grantWriter(a);
        await waitForCanonicalWriter();
      }
      finally { resume.resolve(); }
      const result = await pending;
      expect(result.status, kind).toBe(200);
      await writer;
      event('PHYSICAL_GRANT_REVOKED_AFTER_READER_FENCE');
      vi.restoreAllMocks();
      const fresh = await fixture.managementGet(path, a.auth.accessToken);
      expect(fresh.status, kind).toBe(404);
      expect(fresh.body).not.toHaveProperty('items');
    },
  );

  it.each(['overview', 'physical', 'discovery'] as const)(
    'old LM access token %s during in-flight native refresh follows established session boundary',
    async (kind) => {
      const a = await actor();
      const gate = pauseAfterResolver(a.user.id);
      const path = kind === 'overview' ? overviewPath(a) :
        kind === 'physical' ? physicalPath(a) : discoveryPath(a);
      const pending = fixture.managementGet(path, a.auth.accessToken);
      await gate.entered.promise;
      let replacement = '';
      try {
        const rotated = await fixture.refresh(a.auth.refreshToken);
        expect(rotated.status).toBe(200);
        replacement = String(rotated.body?.accessToken);
        event('NATIVE_REFRESH_HTTP_COMMITTED');
      } finally { gate.resume.resolve(); }
      const result = await pending;
      expect(result.status).toBe(kind === 'discovery' ? 401 : 200);
      vi.restoreAllMocks();
      expect((await fixture.managementGet(path, a.auth.accessToken)).status).toBe(401);
      expect((await fixture.managementGet(path, replacement)).status).toBe(200);
    },
  );

  it('CA Physical read rechecks its Staff session after concurrent refresh', async () => {
    const a = await actor('ORG_ADMIN');
    const gate = pauseAfterResolver(a.user.id);
    const pending = fixture.managementGet(physicalPath(a), a.auth.accessToken);
    await gate.entered.promise;
    try {
      expect((await fixture.refresh(a.auth.refreshToken)).status).toBe(200);
      event('CA_REFRESH_COMMITTED_BEFORE_MFA_RECHECK');
    } finally { gate.resume.resolve(); }
    const result = await pending;
    expect(result.status).toBe(401);
    expect(result.body).not.toHaveProperty('items');
  });

  it('CA Physical MFA factor retirement before assurance recheck fails closed', async () => {
    const a = await actor('ORG_ADMIN');
    const entered = latch();
    const resume = latch();
    const original = companyAuth.eligibleCompanyAdminLocationOrganization;
    vi.spyOn(companyAuth, 'eligibleCompanyAdminLocationOrganization').mockImplementation(async (...args) => {
      const org = await original(...args);
      if (org === a.organizationId) {
        event('CA_ELIGIBILITY_HINT_COMPLETE');
        entered.resolve();
        await resume.promise;
        event('CA_MFA_RECHECK_BEGINS');
      }
      return org;
    });
    const pending = fixture.managementGet(physicalPath(a), a.auth.accessToken);
    await entered.promise;
    try {
      await fixture.query(`UPDATE user_mfa_totp_factors
        SET state='RETIRED', retired_at=clock_timestamp()
        WHERE id=(SELECT mfa_factor_id FROM staff_auth_sessions WHERE id=$1)
          AND state='ACTIVE'`, [a.auth.sessionId]);
      event('SYNTHETIC_MFA_FACTOR_RETIRED');
    } finally { resume.resolve(); }
    const result = await pending;
    expect(result.status).toBe(403);
    expect(result.body).not.toHaveProperty('items');
  });
});
