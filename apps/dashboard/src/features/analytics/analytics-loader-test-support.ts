import type { AnalyticsComposition } from "./analytics-api";
import {
  createAnalyticsLoader,
  type AnalyticsLoader,
} from "./analytics-loader";
import type { LatestRequestSnapshot } from "../../lib/api/latest-request-gate";

/**
 * Shared, framework-free test support for the analytics loader suites
 * (mirrors live-operations-controller-test-support.ts). The stub client
 * serves each analytics ENDPOINT its own contract-valid slice and records
 * deferred requests keyed by (locationId, from, suffix) so tests can answer
 * identities in any order — including partial straggler delivery.
 */

export const LOCATION_A = "11111111-1111-4111-8111-111111111111";
export const LOCATION_B = "22222222-2222-4222-8222-222222222222";
export const PERIOD_1 = "2026-08-01";
export const PERIOD_2 = "2026-08-08";
export const RANGE_END = "2026-08-14";

const ZERO_METRICS = {
  checkInTime: { averageSeconds: null, sampleCount: 0 },
  handoffTime: { averageSeconds: null, sampleCount: 0 },
  parkingTime: { averageSeconds: null, sampleCount: 0 },
  retrievalStartLatencyAuxiliary: { averageSeconds: null, sampleCount: 0 },
  retrievalWait: { averageSeconds: null, sampleCount: 0 },
};

export function compositionFor(
  locationId: string,
  currency: string,
): AnalyticsComposition {
  const envelope = {
    from: PERIOD_1,
    locationId,
    timezone: "Asia/Amman",
    to: RANGE_END,
  };
  return {
    financial: {
      ...envelope,
      cashReconciliation: [],
      currencies: [
        {
          collectedAmountTotal: "10.000",
          currency,
          currentValidationAmountTotal: "0.000",
          digitalPaymentRate: {
            denominator: 2,
            numerator: 1,
            percentage: "50.00",
          },
          paidPaymentCount: 1,
          succeededRefundAmountTotal: "0.000",
          tipAmountTotal: "0.000",
          validationRate: { denominator: 2, numerator: 1, percentage: null },
        },
      ],
    },
    incidents: {
      ...envelope,
      incidentCount: 0,
      incidentsPer1000: { denominator: 0, numerator: 0, value: null },
      severityCounts: [],
      typeCounts: [],
    },
    operations: {
      ...envelope,
      carsHandledPerDay: [],
      metrics: ZERO_METRICS,
    },
    queue: { depth: 0, oldestAgeSeconds: null },
  };
}

interface DeferredEntry {
  fulfill: (value: AnalyticsComposition) => void;
  fail: (error: unknown) => void;
}

export interface DeferredGroup {
  resolve: (value: AnalyticsComposition) => void;
  reject: (error: unknown) => void;
}

function sliceFor(suffix: string, value: AnalyticsComposition): unknown {
  if (suffix === "financial") return value.financial;
  if (suffix === "incidents") return value.incidents;
  if (suffix === "operations") return value.operations;
  throw new Error(`Unexpected suffix: ${suffix}`);
}

export function harness(): {
  loader: AnalyticsLoader;
  snapshots: LatestRequestSnapshot<AnalyticsComposition>[];
  deferAll: (
    locationId: string,
    from: string,
    suffixes?: readonly string[],
  ) => DeferredGroup;
} {
  const snapshots: LatestRequestSnapshot<AnalyticsComposition>[] = [];
  const pending = new Map<string, DeferredEntry[]>();
  const loader = createAnalyticsLoader({
    client: {
      async request<T>(path: string): Promise<T> {
        // Path shape: /dashboard/locations/:id/analytics/<suffix>?from&to
        const segments = path.split("/");
        const locationId = segments[3] ?? "";
        const [suffix, query] = (segments[5] ?? "").split("?");
        if (suffix === "queue") {
          return Promise.resolve({ depth: 0, oldestAgeSeconds: null }) as T;
        }
        const from = new URLSearchParams(query ?? "").get("from") ?? "";
        return new Promise<T>((resolve, reject) => {
          // Keyed by location AND period so identities stay separable.
          const key = `${locationId}|${from}|${suffix}`;
          const queue = pending.get(key) ?? [];
          queue.push({
            fail: reject,
            fulfill: (value) =>
              resolve(sliceFor(suffix ?? "", value) as T),
          });
          pending.set(key, queue);
        });
      },
    },
    onChange: (snapshot) => snapshots.push(snapshot),
  });
  return {
    // Resolves/rejects the pending period requests of ONE (location, period)
    // identity (the composition settles only when
    // operations+financial+incidents all answer). A suffix subset may be
    // given so a straggler request can stay pending for later delivery.
    deferAll: (
      locationId: string,
      from: string,
      suffixes: readonly string[] = ["financial", "incidents", "operations"],
    ): DeferredGroup => {
      const entries: DeferredEntry[] = [];
      for (const suffix of suffixes) {
        const queue = pending.get(`${locationId}|${from}|${suffix}`) ?? [];
        entries.push(...queue.splice(0));
      }
      if (entries.length === 0) throw new Error("no pending requests");
      return {
        reject: (error: unknown): void => {
          for (const entry of entries) entry.fail(error);
        },
        resolve: (value: AnalyticsComposition): void => {
          for (const entry of entries) entry.fulfill(value);
        },
      };
    },
    loader,
    snapshots,
  };
}

/** A macrotask boundary flushes every pending microtask deterministically. */
export function flush(): Promise<void> {
  return new Promise<void>((resolveTimer) => setTimeout(resolveTimer, 0));
}
