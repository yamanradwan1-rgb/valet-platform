import { Client } from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import * as dashboardAuthorization from '../src/modules/dashboard/dashboard-read-authorization';
import {
  actor, event, fixture, latch, overviewPath, startLab, trace,
} from './dashboard-issue319-lab';

beforeAll(startLab, 180_000);
afterAll(() => fixture.stop(), 90_000);
afterEach(() => {
  vi.restoreAllMocks();
  if (trace.length) console.log('ISSUE319_LIFECYCLE_TRACE', JSON.stringify(trace.splice(0)));
});

async function stoppedLocation() {
  const manager = await actor();
  const adminUser = await fixture.createUser();
  await fixture.addMembership(manager.organizationId, adminUser.id, 'ORG_ADMIN');
  const admin = await fixture.nativeLogin(adminUser);
  await fixture.enrollAndAssure(admin);
  const current = await fixture.query<{ updated_at: Date }>(
    'SELECT updated_at FROM locations WHERE id=$1', [manager.locationId],
  );
  const base = `/v1/staff/management/organizations/${manager.organizationId}/locations/${manager.locationId}`;
  const stopped = await fixture.managementPost(`${base}/stop-intake`, admin.accessToken, {
    expectedUpdatedAt: current.rows[0]!.updated_at.toISOString(),
  });
  expect(stopped.status).toBe(201);
  return { manager, admin, base, updatedAt: String(stopped.body?.updatedAt) };
}

async function waitForBlocked(minimum: number) {
  const started = Date.now();
  while (Date.now() - started < 10_000) {
    const result = await fixture.query<{ count: string }>(`
      SELECT count(*)::text AS count FROM pg_stat_activity
      WHERE datname=current_database() AND pid<>pg_backend_pid()
        AND wait_event_type='Lock'`);
    if (Number(result.rows[0]?.count ?? 0) >= minimum) {
      event(`POSTGRES_${minimum}_LOCK_WAITS_OBSERVED`);
      return;
    }
    await new Promise((done) => setTimeout(done, 10));
  }
  throw new Error(`Expected ${minimum} real PostgreSQL lock wait(s).`);
}

function pauseAfterDashboardAuthority(locationId: string) {
  const entered = latch();
  const resume = latch();
  const original = dashboardAuthorization.authorizeDashboardReadLocation;
  vi.spyOn(dashboardAuthorization, 'authorizeDashboardReadLocation')
    .mockImplementation(async (...args) => {
      const scope = await original(...args);
      if (scope && args[1].targetLocationId === locationId) {
        event('DASHBOARD_ORG_SHARED_FENCE_HELD');
        entered.resolve();
        await resume.promise;
        event('DASHBOARD_PROJECTION_RESUMED');
      }
      return scope;
    });
  return { entered, resume };
}

describe('Issue319 canonical Location lifecycle HTTP and lock ordering', () => {
  it('reader-first holds managed deactivation until the authorized read completes', async () => {
    const state = await stoppedLocation();
    const barrier = pauseAfterDashboardAuthority(state.manager.locationId);
    event('READER_REQUEST_START');
    const reader = fixture.managementGet(overviewPath(state.manager), state.manager.auth.accessToken);
    await barrier.entered.promise;
    const writer = fixture.managementPost(`${state.base}/deactivate`, state.admin.accessToken, {
      expectedUpdatedAt: state.updatedAt,
    });
    try {
      await waitForBlocked(1);
      barrier.resume.resolve();
      const before = await reader;
      event('READER_HTTP_COMPLETE');
      expect(before.status).toBe(200);
      const done = await writer;
      event('DEACTIVATION_HTTP_COMPLETE');
      expect(done.status).toBe(201);
      expect((await fixture.managementGet(
        overviewPath(state.manager), state.manager.auth.accessToken,
      )).status).toBe(404);
    } finally { barrier.resume.resolve(); }
  }, 25_000);

  it('revoker-first queues reader after real lifecycle writer and rejects upon commit', async () => {
    const state = await stoppedLocation();
    const gate = new Client({ connectionString: fixture.migrationDatabaseUrl() });
    await gate.connect();
    await gate.query('BEGIN');
    try {
      await gate.query(`SELECT pg_advisory_xact_lock(
        hashtextextended('staff-management-org:' || $1::text, 0))`,
      [state.manager.organizationId]);
      const writer = fixture.managementPost(`${state.base}/deactivate`, state.admin.accessToken, {
        expectedUpdatedAt: state.updatedAt,
      });
      await waitForBlocked(1);
      event('REVOKER_QUEUED_BEFORE_READER');
      const reader = fixture.managementGet(overviewPath(state.manager), state.manager.auth.accessToken);
      await waitForBlocked(2);
      await gate.query('COMMIT');
      event('EXTERNAL_GATE_RELEASED');
      expect((await writer).status).toBe(201);
      const response = await reader;
      event('READER_HTTP_COMPLETE_AFTER_REVOKER');
      expect(response.status).toBe(404);
      expect(response.body).not.toHaveProperty('items');
    } finally {
      await gate.query('ROLLBACK').catch(() => undefined);
      await gate.end();
    }
  }, 25_000);
});
