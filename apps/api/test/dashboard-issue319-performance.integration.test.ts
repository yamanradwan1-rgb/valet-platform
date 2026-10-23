import { performance } from 'node:perf_hooks';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  actor, discoveryPath, fixture, overviewPath, physicalPath, startLab,
} from './dashboard-issue319-lab';

beforeAll(startLab, 180_000);
afterAll(() => fixture.stop(), 90_000);

const samplesPerRoute = 80;

function describeLatency(label: string, samples: number[]) {
  const sorted = samples.slice().sort((a, b) => a - b);
  const at = (fraction: number) => sorted[Math.ceil(fraction * sorted.length) - 1]!;
  const result = {
    label,
    n: sorted.length,
    p50Ms: Number(at(0.5).toFixed(2)),
    p95Ms: Number(at(0.95).toFixed(2)),
    maxMs: Number(sorted[sorted.length - 1]!.toFixed(2)),
    minMs: Number(sorted[0]!.toFixed(2)),
    meanMs: Number((sorted.reduce((total, value) => total + value, 0) / sorted.length).toFixed(2)),
  };
  console.log('ISSUE319_UNCONTENDED_HTTP_LATENCY', JSON.stringify(result));
}

describe('Issue319 uncontended real HTTP latency, descriptive local baseline only', () => {
  it('measures scoped Dashboard, Physical Resources and Discovery independently', async () => {
    const a = await actor();
    const admin = await actor('ORG_ADMIN');
    const routes = [
      { label: 'dashboard-overview-keys', path: overviewPath(a), token: a.auth.accessToken },
      { label: 'physical-resource-key-slots', path: physicalPath(a), token: a.auth.accessToken },
      { label: 'scope-discovery-locations', path: discoveryPath(a), token: a.auth.accessToken },
      { label: 'physical-resource-overview-rr', path: physicalPath(a, 'overview'), token: a.auth.accessToken },
      { label: 'physical-resource-key-slots-ca-mfa', path: physicalPath(admin), token: admin.auth.accessToken },
      { label: 'physical-resource-overview-rr-ca-mfa', path: physicalPath(admin, 'overview'), token: admin.auth.accessToken },
      { label: 'configuration-location-settings', path: `/v1/staff/dashboard/locations/${a.locationId}/configuration`, token: a.auth.accessToken },
    ];
    for (const route of routes) {
      const samples: number[] = [];
      // Warm up one instrumented HTTP/controller/database path per route.
      expect((await fixture.managementGet(route.path, route.token)).status).toBe(200);
      for (let sample = 0; sample < samplesPerRoute; sample++) {
        const start = performance.now();
        const response = await fixture.managementGet(route.path, route.token);
        samples.push(performance.now() - start);
        expect(response.status).toBe(200);
      }
      describeLatency(route.label, samples);
    }
  }, 60_000);
});
