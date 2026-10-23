import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import * as kpiSla from '../src/modules/dashboard/analytics-kpi-sla-query';
import * as assurance from '../src/modules/auth/mfa/mfa-assurance-policy';
import * as companySource from '../src/modules/management/company-analytics-source';
import * as managementAuth from '../src/modules/management/management-authorization';
import { event, fixture, latch, startLab, trace } from './dashboard-issue319-lab';
import {
  observedBlockedBy, preparedCompanyAdmin, recoverCompanyAdmin, signalWithin,
} from './dashboard-issue319-final-mfa-lab';

const sentinel = 'Pacific/Chatham';

beforeAll(startLab, 180_000);
afterAll(() => fixture.stop(), 90_000);
afterEach(() => {
  vi.restoreAllMocks();
  if (trace.length) console.log('ISSUE319_FINAL_READ_EXPORT_TRACE', JSON.stringify(trace.splice(0)));
});

async function readerFirst(
  route: 'KPI' | 'REPORT',
) {
  const s = await preparedCompanyAdmin();
  const path = route === 'KPI'
    ? `/v1/staff/dashboard/locations/${s.admin.locationId}/analytics/kpis?from=2026-07-10&to=2026-07-10`
    : `/v1/staff/management/organizations/${s.admin.organizationId}/reports/daily?date=2026-07-10`;
  const healthy = await fixture.managementGet(path, s.admin.auth.accessToken);
  expect(healthy.status).toBe(200);
  expect(JSON.stringify(healthy.body)).toContain(sentinel);

  const entered = latch();
  const release = latch();
  let readerPid = 0;
  let intercepted = false;
  if (route === 'KPI') {
    const original = kpiSla.querySlaCompliance;
    vi.spyOn(kpiSla, 'querySlaCompliance').mockImplementation(async (...args) => {
      if (!intercepted) {
        intercepted = true;
        readerPid = (await args[0].query<{ pid: number }>(
          'SELECT pg_backend_pid()::integer AS pid')).rows[0]!.pid;
        event(`KPI_READER_AUTH_FENCE_HELD_PID_${readerPid}`);
        entered.resolve();
        await release.promise;
      }
      return original(...args);
    });
  } else {
    const original = companySource.composeCompanyAnalyticsSources;
    vi.spyOn(companySource, 'composeCompanyAnalyticsSources').mockImplementation(async (...args) => {
      if (!intercepted && args[1].organizationId === s.admin.organizationId) {
        intercepted = true;
        readerPid = (await args[0].query<{ pid: number }>(
          'SELECT pg_backend_pid()::integer AS pid')).rows[0]!.pid;
        event(`REPORT_READER_AUTH_FENCE_HELD_PID_${readerPid}`);
        entered.resolve();
        await release.promise;
      }
      return original(...args);
    });
  }

  const reader = fixture.managementGet(path, s.admin.auth.accessToken);
  let writer: Promise<void> | undefined;
  try {
    await signalWithin(entered.promise);
    expect(readerPid).toBeGreaterThan(0);
    writer = recoverCompanyAdmin(s);
    const waitingPid = await observedBlockedBy(readerPid);
    event(`${route}_RECOVERY_PID_${waitingPid}_WAITED_ON_READER_${readerPid}`);
    release.resolve();
    const valid = await reader;
    expect(valid.status).toBe(200);
    expect(JSON.stringify(valid.body)).toContain(sentinel);
    await writer;
    const fresh = await fixture.managementGet(path, s.admin.auth.accessToken);
    expect(fresh.status).toBe(403);
    expect(JSON.stringify(fresh.body)).not.toContain(sentinel);
  } finally {
    release.resolve();
    await Promise.allSettled([reader, writer].filter((p) => p !== undefined));
  }
}

describe('Issue319 final CA RR read and export acceptance', () => {
  it('KPI reader-first orders canonical factor recovery with actual PG lock wait',
    async () => readerFirst('KPI'), 35_000);
  it('Company Report reader-first orders canonical factor recovery with actual PG lock wait',
    async () => readerFirst('REPORT'), 35_000);

  it.each([
    ['WEEKLY', 'weekly?weekStart=2026-07-06'],
    ['MONTHLY', 'monthly?month=2026-07'],
  ] as const)('%s Report RR denies revoker-first previously assured snapshot',
    async (kind, query) => {
      const s = await preparedCompanyAdmin();
      const path = `/v1/staff/management/organizations/${s.admin.organizationId}/reports/${query}`;
      const healthy = await fixture.managementGet(path, s.admin.auth.accessToken);
      expect(healthy.status).toBe(200);
      expect(JSON.stringify(healthy.body)).toContain(sentinel);
      const entered = latch();
      const release = latch();
      let snapshot = '';
      let afterSnapshot = '';
      let intercepted = false;
      const original = assurance.requireMfaAssuranceInTransaction;
      vi.spyOn(assurance, 'requireMfaAssuranceInTransaction')
        .mockImplementation(async (...args) => {
          if (!intercepted && args[1].staffAuthSessionId === s.admin.auth.sessionId) {
            intercepted = true;
            snapshot = (await args[0].query<{ snapshot: string }>(
              'SELECT txid_current_snapshot()::text AS snapshot')).rows[0]!.snapshot;
            entered.resolve();
            await release.promise;
            afterSnapshot = (await args[0].query<{ snapshot: string }>(
              'SELECT txid_current_snapshot()::text AS snapshot')).rows[0]!.snapshot;
          }
          return original(...args);
        });
      const pending = fixture.managementGet(path, s.admin.auth.accessToken);
      try {
        await signalWithin(entered.promise);
        await recoverCompanyAdmin(s);
        event(`${kind}_RECOVERY_COMMITTED_BEFORE_RR_FACTOR_FENCE`);
      } finally {
        release.resolve();
      }
      const denied = await pending;
      expect(snapshot).toBe(afterSnapshot);
      expect(denied.status).toBe(403);
      expect(JSON.stringify(denied.body)).not.toContain(sentinel);
      expect((await fixture.managementGet(path, s.admin.auth.accessToken)).status).toBe(403);
    }, 35_000);

  it('CSV export finalizer rechecks authorization after previous RR snapshot', async () => {
    const s = await preparedCompanyAdmin();
    const path = `/v1/staff/management/organizations/${s.admin.organizationId}/reports/exports`;
    const body = { kind: 'DAILY', date: '2026-07-10', format: 'CSV' };
    const request = () => fixture.requestBytes(path, {
      authorization: `Bearer ${s.admin.auth.accessToken}`, body, method: 'POST',
    });
    const baseline = await request();
    expect(baseline.status).toBe(200);
    expect(baseline.headers.get('content-type')).toContain('text/csv');

    const entered = latch();
    const release = latch();
    let calls = 0;
    const original = managementAuth.authorizeCompanyAdminManagement;
    vi.spyOn(managementAuth, 'authorizeCompanyAdminManagement')
      .mockImplementation(async (...args) => {
        if (args[2].capability === 'REPORT_EXPORT') {
          calls += 1;
          if (calls === 2) {
            event('CSV_AFTER_RR_BEFORE_FRESH_FINALIZER');
            entered.resolve();
            await release.promise;
          }
        }
        return original(...args);
      });
    const pending = request();
    try {
      await signalWithin(entered.promise);
      await recoverCompanyAdmin(s);
      event('CSV_CANONICAL_RECOVERY_COMMITTED_BEFORE_FINALIZER');
    } finally {
      release.resolve();
    }
    const denied = await pending;
    expect(denied.status).toBe(403);
    expect(denied.headers.get('content-type')).not.toContain('text/csv');
    expect(Buffer.from(denied.bytes).toString()).not.toContain(sentinel);
    const generated = await fixture.query<{ total: string }>(
      `SELECT count(*)::text AS total FROM audit_events
       WHERE organization_id=$1 AND event_type='DASHBOARD_REPORT_EXPORT_GENERATED'`,
      [s.admin.organizationId]);
    expect(generated.rows[0]?.total).toBe('1');
    expect((await request()).status).toBe(403);
  }, 40_000);
});
