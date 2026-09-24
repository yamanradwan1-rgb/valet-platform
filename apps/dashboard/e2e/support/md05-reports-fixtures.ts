import type { Page, Request, Route } from "@playwright/test";

import type { FixtureReply } from "./dashboard-api-fixture";
import { LOCATION_A, ORG_A } from "./dashboard-api-fixture";
import { financialCurrency } from "./md05-intelligence-fixtures";

export const REPORT_SELECTORS = {
  daily: "2026-09-21",
  weekly: "2026-09-21",
  monthly: "2026-09",
} as const;

export const companyReportPaths = {
  daily: `/v1/staff/management/organizations/${ORG_A.organizationId}/reports/daily`,
  weekly: `/v1/staff/management/organizations/${ORG_A.organizationId}/reports/weekly`,
  monthly: `/v1/staff/management/organizations/${ORG_A.organizationId}/reports/monthly`,
  export: `/v1/staff/management/organizations/${ORG_A.organizationId}/reports/exports`,
} as const;

export const locationReportPaths = {
  daily: `/v1/staff/dashboard/locations/${LOCATION_A.locationId}/reports/daily`,
  weekly: `/v1/staff/dashboard/locations/${LOCATION_A.locationId}/reports/weekly`,
  monthly: `/v1/staff/dashboard/locations/${LOCATION_A.locationId}/reports/monthly`,
  export: `/v1/staff/dashboard/locations/${LOCATION_A.locationId}/reports/exports`,
} as const;

const keyTypes = ["KEY_MISSING", "WRONG_KEY", "KEY_DAMAGED", "KEY_LOCKED_INSIDE"] as const;

function duration(company = false) {
  return company
    ? { sampleCount: 2, averageSeconds: "12.500", contributingLocationCount: 1 }
    : { sampleCount: 2, averageSeconds: "12.500" };
}

function period(path: string, request: Request) {
  const query = new URL(request.url()).searchParams;
  if (path.endsWith("/daily")) {
    const date = query.get("date") ?? REPORT_SELECTORS.daily;
    return { kind: "DAILY" as const, from: date, to: date };
  }
  if (path.endsWith("/weekly")) {
    const from = query.get("weekStart") ?? REPORT_SELECTORS.weekly;
    const millis = Date.parse(`${from}T00:00:00Z`) + 6 * 86_400_000;
    return { kind: "WEEKLY" as const, from, to: new Date(millis).toISOString().slice(0, 10) };
  }
  const month = query.get("month") ?? REPORT_SELECTORS.monthly;
  const [year, monthNumber] = month.split("-").map(Number);
  const last = new Date(Date.UTC(year!, monthNumber!, 0)).getUTCDate();
  return { kind: "MONTHLY" as const, from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

function incidents(marker: number) {
  return {
    incidentCount: marker,
    severityCounts: [{ severity: "LOW", count: marker }],
    typeCounts: [{ type: "TEST", count: marker }],
    incidentsPer1000: { numerator: marker, denominator: marker, value: "1000.000" },
  };
}

function dailyActivity(marker: number) {
  return {
    retrievalRequestedCount: marker,
    dispatchEventCounts: [{ taskType: "RETRIEVAL", eventType: "QUEUED", count: marker }],
    keyCustodyEventCounts: [{ eventType: "RELEASED", count: marker }],
  };
}

export function locationReportReply(path: string, request: Request, marker = 4): FixtureReply | undefined {
  if (!Object.values(locationReportPaths).includes(path as never) || path === locationReportPaths.export) return undefined;
  const selected = period(path, request);
  const summary = {
    metrics: {
      checkInTime: duration(), parkingTime: duration(), retrievalWait: duration(),
      retrievalStartLatencyAuxiliary: duration(), handoffTime: duration(),
    },
    carsHandledPerDay: [{ date: selected.from, handledCount: marker }],
    currencies: [financialCurrency("JOD", `${marker}.000`)],
    cashReconciliation: [{
      currency: "JOD", cashExpectedTotal: "5.000", cashReportedTotal: "4.000", cashVarianceTotal: "-1.000",
    }],
    incidents: incidents(marker),
  };
  return { body: {
    locationId: LOCATION_A.locationId,
    timezone: LOCATION_A.timezone,
    kind: selected.kind,
    periodFrom: selected.from,
    periodTo: selected.to,
    summary,
    ...(selected.kind === "DAILY" ? { dailyActivity: dailyActivity(marker) } : {}),
  } };
}

export function companyReportReply(path: string, request: Request, marker = 7): FixtureReply | undefined {
  if (!Object.values(companyReportPaths).includes(path as never) || path === companyReportPaths.export) return undefined;
  const selected = period(path, request);
  const companyDuration = duration(true);
  const summary = {
    coverage: {
      totalLocationCount: 2, activeLocationCount: 1, inactiveLocationCount: 1,
      timezoneBoundaries: [{
        timezone: "Asia/Amman", locationCount: 2, activeLocationCount: 1, inactiveLocationCount: 1,
        periodStartUtc: `${selected.from}T00:00:00.000Z`, periodEndUtc: `${selected.to}T23:59:59.000Z`,
      }],
    },
    operational: {
      metrics: {
        checkInTime: companyDuration, parkingTime: companyDuration, retrievalWait: companyDuration,
        retrievalStartLatencyAuxiliary: companyDuration, handoffTime: companyDuration,
      },
      carsHandledPerDay: [{ date: selected.from, handledCount: marker }],
    },
    financial: {
      currencies: [financialCurrency("JOD", `${marker}.000`)],
      cashReconciliation: [{ currency: "JOD", cashExpectedTotal: "8.000", cashReportedTotal: "7.000", cashVarianceTotal: "-1.000" }],
    },
    incidents: incidents(marker),
    kpis: {
      slaCompliance: { numerator: marker, denominator: marker, percentage: "100.00", missingTargetCount: 0, invalidOrMissingIntervalCount: 0, contributingLocationCount: 1, requestCount: marker },
      carsPerActiveEmployee: { numerator: marker, denominator: 1, value: `${marker}.000`, evidenceLocationCount: 1 },
      carsHandedOff: { attributedCount: marker, missingAttributionCount: 0, distinctAttributedEmployeeCount: 1 },
      keyExceptions: { count: 0, byType: keyTypes.map((type) => ({ type, count: 0 })) },
    },
  };
  return { body: {
    organizationId: ORG_A.organizationId,
    kind: selected.kind,
    periodFrom: selected.from,
    periodTo: selected.to,
    summary,
    ...(selected.kind === "DAILY" ? { dailyActivity: dailyActivity(marker) } : {}),
  } };
}

export function subscriptionReply(exportsAllowed: boolean, location = false): FixtureReply {
  return { body: {
    organizationId: ORG_A.organizationId,
    ...(location ? { locationId: LOCATION_A.locationId } : {}),
    subscription: {
      planCode: "E2E", status: "ACTIVE",
      entitlements: { dashboardAccess: true, reportExports: exportsAllowed, basicBranding: true },
    },
  } };
}

export type BinaryReply =
  | { readonly kind: "artifact"; readonly format: "CSV" | "PDF"; readonly company?: boolean; readonly delayMs?: number }
  | { readonly kind: "json"; readonly status: number; readonly body: unknown }
  | { readonly kind: "abort"; readonly delayMs?: number };

export class ReportBinaryFixture {
  readonly bodies: unknown[] = [];
  readonly methods: string[] = [];
  readonly urls: string[] = [];
  posts = 0;

  constructor(private readonly reply: (request: Request, count: number) => BinaryReply) {}

  async install(page: Page) {
    await page.route("**/v1/staff/**/reports/exports", async (route) => {
      const request = route.request();
      this.posts += 1;
      this.bodies.push(request.postDataJSON());
      this.methods.push(request.method());
      this.urls.push(request.url());
      await this.fulfill(route, this.reply(request, this.posts));
    });
  }

  private async fulfill(route: Route, reply: BinaryReply) {
    if (reply.delayMs) await new Promise((resolve) => setTimeout(resolve, reply.delayMs));
    if (reply.kind === "abort") {
      await route.abort("connectionreset");
      return;
    }
    if (reply.kind === "json") {
      await route.fulfill({ status: reply.status, contentType: "application/json", body: JSON.stringify(reply.body) });
      return;
    }
    const requestBody = this.bodies.at(-1) as { kind: string };
    const periodFrom = requestBody.kind === "MONTHLY" ? "2026-09-01" : REPORT_SELECTORS.daily;
    const prefix = reply.company ? "company-report" : "report";
    const extension = reply.format.toLowerCase();
    const filename = `${prefix}-${requestBody.kind.toLowerCase()}-${periodFrom}.${extension}`;
    const body = reply.format === "CSV"
      ? Buffer.from("section,key,subkey,currency,value\r\nDURATION,CheckInTime,sampleCount,,2\r\n", "utf8")
      : Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF", "ascii");
    await route.fulfill({
      status: 200,
      body,
      headers: {
        "Content-Type": reply.format === "CSV" ? "text/csv; charset=utf-8" : "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  }
}
