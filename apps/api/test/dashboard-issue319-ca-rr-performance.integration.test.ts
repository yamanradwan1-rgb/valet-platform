import { performance } from 'node:perf_hooks';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { actor, fixture, startLab } from './dashboard-issue319-lab';

const sampleSize = 40;

function quantile(sorted: number[], fraction: number): number {
  return Number(sorted[Math.min(sorted.length - 1,
    Math.ceil(sorted.length * fraction) - 1)]!.toFixed(2));
}

beforeAll(startLab, 180_000);
afterAll(() => fixture.stop(), 90_000);

describe('Issue #319 final CA RR fixed-path uncontended HTTP performance', () => {
  it('samples accepted MFA Company Admin KPI, analytics and daily report read paths',
    async () => {
      const a = await actor('ORG_ADMIN');
      const routes = [
        ['KPI', `/v1/staff/dashboard/locations/${a.locationId}/analytics/kpis?from=2026-07-10&to=2026-07-10`],
        ['COMPANY_ANALYTICS', `/v1/staff/management/organizations/${a.organizationId}/analytics/all-locations?from=2026-07-10&to=2026-07-10`],
        ['COMPANY_REPORT_DAILY', `/v1/staff/management/organizations/${a.organizationId}/reports/daily?date=2026-07-10`],
      ] as const;
      for (const [route, path] of routes) {
        const durations: number[] = [];
        const warmup = await fixture.managementGet(path, a.auth.accessToken);
        expect(warmup.status).toBe(200);
        for (let index = 0; index < sampleSize; index += 1) {
          const start = performance.now();
          const result = await fixture.managementGet(path, a.auth.accessToken);
          const elapsed = performance.now() - start;
          expect(result.status).toBe(200);
          durations.push(elapsed);
        }
        durations.sort((x, y) => x - y);
        console.log('ISSUE319_CA_RR_FIXED_HTTP_PERFORMANCE', JSON.stringify({
          route, samples: sampleSize, p50Ms: quantile(durations, 0.5),
          p95Ms: quantile(durations, 0.95), minimumMs: Number(durations[0]!.toFixed(2)),
          maximumMs: Number(durations[durations.length - 1]!.toFixed(2)),
          concurrency: 1, contention: 'none', measurements: 'sequential local Nest HTTP',
        }));
      }
    }, 120_000);
});
