import type { DailyReportResponse, PeriodicReportResponse } from "@valet/contracts";

import { createReportsLoader } from "./reports-loader";
import type { ReportsLoader } from "./reports-loader";
import type { ReportsClient } from "./reports-api";
import type { LatestRequestSnapshot } from "../../lib/api/latest-request-gate";
import type { ReportResponse } from "./reports-api";

/**
 * Shared, framework-free test support for the reports suites. Fixtures are
 * strictly contract-valid slices of the D4-002 report schemas; the stub
 * client serves per-identity responses and records deferred requests keyed
 * by (locationId, kind, periodValue) so tests can answer identities in any
 * order.
 */

export const LOCATION_A = "11111111-1111-4111-8111-111111111111";
export const LOCATION_B = "22222222-2222-4222-8222-222222222222";

export const ZERO_SUMMARY = {
  carsHandledPerDay: [{ date: "2026-01-05", handledCount: 7 }],
  cashReconciliation: [
    {
      cashExpectedTotal: "-1.500",
      cashReportedTotal: "2.000",
      cashVarianceTotal: "3.500",
      currency: "JOD",
    },
  ],
  currencies: [
    {
      collectedAmountTotal: "10.000",
      currency: "JOD",
      currentValidationAmountTotal: "0.000",
      digitalPaymentRate: { denominator: 2, numerator: 1, percentage: null },
      paidPaymentCount: 1,
      succeededRefundAmountTotal: "0.000",
      tipAmountTotal: "0.250",
      validationRate: { denominator: 2, numerator: 1, percentage: "50.00" },
    },
  ],
  incidents: {
    incidentCount: 0,
    incidentsPer1000: { denominator: 0, numerator: 0, value: null },
    severityCounts: [],
    typeCounts: [],
  },
  metrics: {
    checkInTime: { averageSeconds: null, sampleCount: 0 },
    handoffTime: { averageSeconds: null, sampleCount: 0 },
    parkingTime: { averageSeconds: null, sampleCount: 0 },
    retrievalStartLatencyAuxiliary: { averageSeconds: null, sampleCount: 0 },
    retrievalWait: { averageSeconds: null, sampleCount: 0 },
  },
};

export const ZERO_DAILY_ACTIVITY = {
  dispatchEventCounts: [],
  keyCustodyEventCounts: [],
  retrievalRequestedCount: 0,
};

export function dailyResponseFor(locationId: string): DailyReportResponse {
  return {
    dailyActivity: ZERO_DAILY_ACTIVITY,
    kind: "DAILY",
    locationId,
    periodFrom: "2026-01-05",
    periodTo: "2026-01-05",
    summary: ZERO_SUMMARY,
    timezone: "Asia/Amman",
  };
}

export function weeklyResponseFor(locationId: string): PeriodicReportResponse {
  return {
    kind: "WEEKLY",
    locationId,
    periodFrom: "2026-01-05",
    periodTo: "2026-01-11",
    summary: ZERO_SUMMARY,
    timezone: "Asia/Amman",
  };
}

interface DeferredEntry {
  fail: (error: unknown) => void;
  fulfill: (value: ReportResponse) => void;
}

export interface DeferredGroup {
  reject: (error: unknown) => void;
  resolve: (value: ReportResponse) => void;
}

export function harness(): {
  loader: ReportsLoader;
  snapshots: LatestRequestSnapshot<ReportResponse>[];
  deferAll: (
    locationId: string,
    kind: string,
    periodValue: string,
  ) => DeferredGroup;
} {
  const snapshots: LatestRequestSnapshot<ReportResponse>[] = [];
  const pending = new Map<string, DeferredEntry[]>();
  const loader = createReportsLoader({
    client: {
      async request<T>(path: string): Promise<T> {
        // Path shape:
        // /dashboard/locations/:id/reports/<kind-suffix>?date|weekStart|month
        const segments = path.split("/");
        const locationId = segments[3] ?? "";
        const [suffix, query] = (segments[5] ?? "").split("?");
        const params = new URLSearchParams(query ?? "");
        const periodValue =
          params.get("date") ??
          params.get("weekStart") ??
          params.get("month") ??
          "";
        const kind =
          suffix === "daily" ? "DAILY" : suffix === "weekly" ? "WEEKLY" : "MONTHLY";
        return new Promise<T>((resolve, reject) => {
          const key = `${locationId}|${kind}|${periodValue}`;
          const queue = pending.get(key) ?? [];
          queue.push({
            fail: reject,
            fulfill: (value) => resolve(value as T),
          });
          pending.set(key, queue);
        });
      },
      requestBinary(): Promise<never> {
        throw new Error("reads never use the binary transport");
      },
    } as unknown as ReportsClient,
    onChange: (snapshot) => snapshots.push(snapshot),
  });
  return {
    deferAll: (locationId, kind, periodValue): DeferredGroup => {
      const entries = pending.get(`${locationId}|${kind}|${periodValue}`) ?? [];
      const queue = entries.splice(0);
      if (queue.length === 0) throw new Error("no pending requests");
      return {
        reject: (error: unknown): void => {
          for (const entry of queue) entry.fail(error);
        },
        resolve: (value: ReportResponse): void => {
          for (const entry of queue) entry.fulfill(value);
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
