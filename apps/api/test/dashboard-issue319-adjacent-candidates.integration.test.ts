import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import * as locationAuth from '../src/modules/dashboard/dashboard-location-authorization';
import {
  actor, event, fixture, grantWriter, latch, startLab, trace,
} from './dashboard-issue319-lab';

beforeAll(startLab, 180_000);
afterAll(() => fixture.stop(), 90_000);
afterEach(() => {
  vi.restoreAllMocks();
  if (trace.length) console.log('ISSUE319_ADJACENT_CANDIDATE_TRACE', JSON.stringify(trace.splice(0)));
});

describe('Issue319 adjacent Branding / Subscription revoker-first regression', () => {
  it.each(['branding', 'subscription'] as const)(
    '%s denies a reader whose grant was revoked before its authorization fence', async (kind) => {
      const a = await actor();
      const syntheticName = `ISSUE319-SYNTHETIC-${kind.toUpperCase()}`;
      if (kind === 'branding') {
        await fixture.query('UPDATE organizations SET name=$2 WHERE id=$1',
          [a.organizationId, syntheticName]);
      }
      const entered = latch();
      const resume = latch();
      const original = locationAuth.authorizeDashboardLocation;
      let intercepted = false;
      vi.spyOn(locationAuth, 'authorizeDashboardLocation').mockImplementation(async (...args) => {
        const scope = await original(...args);
        if (!intercepted && scope?.locationId === a.locationId) {
          intercepted = true;
          event('ADJACENT_PREPROJECTION_AUTH_HINT_COMPLETE');
          entered.resolve();
          await resume.promise;
        }
        return scope;
      });
      const path = `/v1/staff/dashboard/locations/${a.locationId}/${kind}`;
      const pending = fixture.managementGet(path, a.auth.accessToken);
      await entered.promise;
      try {
        await grantWriter(a);
        event('ADJACENT_CANONICAL_GRANT_REMOVAL_COMMITTED');
      } finally { resume.resolve(); }
      const denied = await pending;
      event('ADJACENT_HTTP_DENIED_AFTER_PRIOR_REVOCATION');
      expect(denied.status).toBe(404);
      expect(JSON.stringify(denied.body)).not.toContain(syntheticName);
      expect(denied.body).not.toHaveProperty('displayName');
      expect(denied.body).not.toHaveProperty('subscription');
      expect(denied.body).not.toHaveProperty('organizationId');
      vi.restoreAllMocks();
      const fresh = await fixture.managementGet(path, a.auth.accessToken);
      expect(fresh.status).toBe(404);
      expect(fresh.body).not.toHaveProperty('displayName');
      expect(fresh.body).not.toHaveProperty('subscription');
    }, 20_000,
  );
});
