import {
  dailyReportQuerySchema,
  dailyReportResponseSchema,
  monthlyReportQuerySchema,
  periodicReportResponseSchema,
  reportExportRequestSchema,
  weeklyReportQuerySchema,
  type DailyReportResponse,
  type ExportFormat,
  type PeriodicReportResponse,
  type ReportExportRequest,
  type ReportKind,
} from "@valet/contracts";

import { DashboardApiError } from "../../lib/api/api-error";
import type { StaffApiClient } from "../../lib/api/staff-api-client";

/**
 * Reports transport (D4-002).
 *
 * Endpoints re-verified against apps/api report.controller.ts:
 * - GET /v1/staff/dashboard/locations/:locationId/reports/daily?date=...
 *   -> dailyReportResponseSchema
 * - GET /v1/staff/dashboard/locations/:locationId/reports/weekly?weekStart=...
 *   -> periodicReportResponseSchema (kind WEEKLY)
 * - GET /v1/staff/dashboard/locations/:locationId/reports/monthly?month=...
 *   -> periodicReportResponseSchema (kind MONTHLY)
 * - POST /v1/staff/dashboard/locations/:locationId/reports/exports
 *   -> binary artifact (text/csv | application/pdf) produced ENTIRELY by
 *      the backend. This frontend never generates CSV/PDF bytes itself.
 *
 * The path is client-relative: the shared StaffApiClient base URL supplies
 * the single `/v1/staff` prefix. Outgoing queries are checked against the
 * shared contract schemas so a malformed period can never be sent; the
 * backend remains the authority on period semantics.
 *
 * MONEY / RATE PRECISION: per-currency money totals are exact decimal
 * STRINGS (signed where the contract allows), backend-computed rates carry
 * string percentages and nullable values — all pass through untouched.
 * Currencies stay separate groups and are never summed, converted or
 * totaled client-side.
 */

export type ReportsClient = Pick<StaffApiClient, "request" | "requestBinary">;

export type ReportResponse = DailyReportResponse | PeriodicReportResponse;

/** Minimal structural view of a shared @valet/contracts Zod schema. */
interface ContractSchema<TData> {
  safeParse(
    value: unknown,
  ): { success: true; data: TData } | { success: false; error: unknown };
}

interface QueryContract {
  safeParse(value: unknown): { success: boolean };
}

function parseReportPayload<TData>(
  schema: ContractSchema<TData>,
  payload: unknown,
  diagnosticCode: string,
): TData {
  const result = schema.safeParse(payload);
  if (!result.success) {
    throw new DashboardApiError({
      kind: "server",
      status: 0,
      code: diagnosticCode,
      message: "The report response did not match the shared contract.",
    });
  }
  return result.data;
}

function assertValidReportQuery(
  schema: QueryContract,
  value: Record<string, string>,
): void {
  if (!schema.safeParse(value).success) {
    throw new DashboardApiError({
      kind: "validation",
      status: 0,
      code: "REPORTS_PERIOD_QUERY_INVALID",
      message: "The requested report period is not contract-valid.",
    });
  }
}

function reportLocationPath(
  locationId: string,
  suffix: string,
): string {
  return `/dashboard/locations/${encodeURIComponent(locationId)}/reports/${suffix}`;
}

async function fetchDailyReport(
  client: ReportsClient,
  locationId: string,
  date: string,
  signal?: AbortSignal,
): Promise<DailyReportResponse> {
  assertValidReportQuery(dailyReportQuerySchema, { date });
  const payload = await client.request<unknown>(
    `${reportLocationPath(locationId, "daily")}?date=${encodeURIComponent(date)}`,
    { signal },
  );
  return parseReportPayload(
    dailyReportResponseSchema,
    payload,
    "REPORTS_DAILY_RESPONSE_INVALID",
  );
}

async function fetchPeriodicReport(
  client: ReportsClient,
  locationId: string,
  kind: Extract<ReportKind, "MONTHLY" | "WEEKLY">,
  periodValue: string,
  signal?: AbortSignal,
): Promise<PeriodicReportResponse> {
  const suffix = kind === "WEEKLY" ? "weekly" : "monthly";
  const query =
    kind === "WEEKLY"
      ? { weekStart: periodValue }
      : { month: periodValue };
  assertValidReportQuery(
    kind === "WEEKLY" ? weeklyReportQuerySchema : monthlyReportQuerySchema,
    query,
  );
  const params = new URLSearchParams(query);
  const payload = await client.request<unknown>(
    `${reportLocationPath(locationId, suffix)}?${params.toString()}`,
    { signal },
  );
  return parseReportPayload(
    periodicReportResponseSchema,
    payload,
    "REPORTS_PERIODIC_RESPONSE_INVALID",
  );
}

/** Loads one report for one (location, kind, period) request identity. */
export async function loadReport(
  client: ReportsClient,
  identity: {
    readonly locationId: string;
    readonly kind: ReportKind;
    readonly periodValue: string;
  },
  signal?: AbortSignal,
): Promise<ReportResponse> {
  if (identity.kind === "DAILY") {
    return fetchDailyReport(
      client,
      identity.locationId,
      identity.periodValue,
      signal,
    );
  }
  return fetchPeriodicReport(
    client,
    identity.locationId,
    identity.kind,
    identity.periodValue,
    signal,
  );
}

/**
 * Builds the export POST body as the contract's discriminated union and
 * validates it before any network traffic; invalid combinations can never
 * be sent.
 */
export function buildReportExportRequest(
  kind: ReportKind,
  format: ExportFormat,
  periodValue: string,
): ReportExportRequest {
  const candidate =
    kind === "DAILY"
      ? { date: periodValue, format, kind }
      : kind === "WEEKLY"
        ? { format, kind, weekStart: periodValue }
        : { format, kind, month: periodValue };
  const result = reportExportRequestSchema.safeParse(candidate);
  if (!result.success) {
    throw new DashboardApiError({
      kind: "validation",
      status: 0,
      code: "REPORTS_EXPORT_REQUEST_INVALID",
      message: "The requested report export is not contract-valid.",
    });
  }
  return result.data;
}

export interface ResolvedReportExport {
  readonly bytes: Uint8Array;
  readonly contentType: string;
  readonly contentDisposition: string | null;
}

/**
 * True when contentType's media type IS exactly the family (parameters like
 * charset tolerated; near-miss families such as text/csvx rejected).
 */
export function contentTypeMatchesFamily(
  contentType: string,
  family: "application/pdf" | "text/csv",
): boolean {
  const lower = contentType.toLowerCase();
  const index = lower.indexOf(family);
  if (index < 0) return false;
  const afterFamily = index + family.length;
  return (
    afterFamily === lower.length || /[\s;]/u.test(lower[afterFamily] as string)
  );
}

/**
 * Requests the backend-produced artifact. The response Content-Type must
 * match the requested format family exactly (parameters ignored); anything
 * else is honest contract drift and never becomes a download.
 */
export async function exportReport(
  client: ReportsClient,
  locationId: string,
  request: ReportExportRequest,
  signal?: AbortSignal,
): Promise<ResolvedReportExport> {
  const response = await client.requestBinary(
    reportLocationPath(locationId, "exports"),
    { body: request, method: "POST", signal },
  );
  const contentType = (response.contentType ?? "").toLowerCase();
  const family = request.format === "CSV" ? "text/csv" : "application/pdf";
  if (!contentTypeMatchesFamily(contentType, family)) {
    throw new DashboardApiError({
      kind: "server",
      status: 0,
      code: "REPORTS_EXPORT_RESPONSE_INVALID",
      message: "The export artifact did not match the requested format.",
    });
  }
  return {
    bytes: response.bytes,
    contentDisposition: response.contentDisposition,
    contentType,
  };
}
