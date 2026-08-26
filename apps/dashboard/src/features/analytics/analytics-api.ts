import {
  analyticsPeriodQuerySchema,
  financialAnalyticsResponseSchema,
  incidentAnalyticsResponseSchema,
  operationalAnalyticsResponseSchema,
  queueSnapshotResponseSchema,
  type FinancialAnalyticsResponse,
  type IncidentAnalyticsResponse,
  type OperationalAnalyticsResponse,
  type QueueSnapshotResponse,
} from "@valet/contracts";

import { DashboardApiError } from "../../lib/api/api-error";
import type { StaffApiClient } from "../../lib/api/staff-api-client";

/**
 * Analytics transport (D4-001).
 *
 * Endpoints re-verified against apps/api analytics.controller.ts:
 * - GET /v1/staff/dashboard/locations/:locationId/analytics/operations?from&to
 *   -> operationalAnalyticsResponseSchema
 * - GET /v1/staff/dashboard/locations/:locationId/analytics/financial?from&to
 *   -> financialAnalyticsResponseSchema
 * - GET /v1/staff/dashboard/locations/:locationId/analytics/incidents?from&to
 *   -> incidentAnalyticsResponseSchema
 * - GET /v1/staff/dashboard/locations/:locationId/analytics/queue (no period)
 *   -> queueSnapshotResponseSchema ({ depth, oldestAgeSeconds: string | null })
 *
 * The path is client-relative: the shared StaffApiClient base URL supplies
 * the `/v1/staff` prefix. The outgoing query is checked against the shared
 * `analyticsPeriodQuerySchema` so a malformed period can never be sent; the
 * backend remains the authority on period semantics.
 *
 * MONEY / RATE PRECISION: per-currency money totals are exact decimal
 * STRINGS and backend-computed rates carry string percentages — all pass
 * through untouched. Currencies stay separate groups and are never summed,
 * converted or totaled client-side, and no frontend formula recomputes any
 * rate: numerators/denominators/values render as reported.
 */

/** Minimal structural surface of the shared authenticated transport. */
export type AnalyticsClient = Pick<StaffApiClient, "request">;

export interface AnalyticsComposition {
  readonly operations: OperationalAnalyticsResponse;
  readonly financial: FinancialAnalyticsResponse;
  readonly incidents: IncidentAnalyticsResponse;
  readonly queue: QueueSnapshotResponse;
}

export function analyticsLocationPath(
  locationId: string,
  suffix: string,
): string {
  return `/dashboard/locations/${encodeURIComponent(locationId)}/analytics/${suffix}`;
}

export function analyticsPeriodQuery(from: string, to: string): string {
  const params = new URLSearchParams();
  params.set("from", from);
  params.set("to", to);
  return `?${params.toString()}`;
}

/**
 * Minimal structural view of a shared @valet/contracts Zod schema so this
 * module validates payloads without depending on zod directly.
 */
interface ContractSchema<TData> {
  safeParse(
    value: unknown,
  ):
    | { success: true; data: TData }
    | { success: false; error: unknown };
}

function parseAnalyticsPayload<TData>(
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
      message: "The analytics response did not match the shared contract.",
    });
  }
  return result.data;
}

function assertValidPeriodQuery(from: string, to: string): void {
  const parsed = analyticsPeriodQuerySchema.safeParse({ from, to });
  if (!parsed.success) {
    throw new DashboardApiError({
      kind: "validation",
      status: 0,
      code: "ANALYTICS_PERIOD_QUERY_INVALID",
      message: "The requested analytics period is not contract-valid.",
    });
  }
}

async function fetchWithPeriod<TData>(
  client: AnalyticsClient,
  locationId: string,
  from: string,
  to: string,
  signal: AbortSignal | undefined,
  suffix: string,
  schema: ContractSchema<TData>,
  diagnosticCode: string,
): Promise<TData> {
  assertValidPeriodQuery(from, to);
  const payload = await client.request<unknown>(
    `${analyticsLocationPath(locationId, suffix)}${analyticsPeriodQuery(from, to)}`,
    { signal },
  );
  return parseAnalyticsPayload(schema, payload, diagnosticCode);
}

export async function fetchOperationalAnalytics(
  client: AnalyticsClient,
  locationId: string,
  from: string,
  to: string,
  signal?: AbortSignal,
): Promise<OperationalAnalyticsResponse> {
  return fetchWithPeriod(
    client,
    locationId,
    from,
    to,
    signal,
    "operations",
    operationalAnalyticsResponseSchema,
    "ANALYTICS_OPERATIONS_RESPONSE_INVALID",
  );
}

export async function fetchFinancialAnalytics(
  client: AnalyticsClient,
  locationId: string,
  from: string,
  to: string,
  signal?: AbortSignal,
): Promise<FinancialAnalyticsResponse> {
  return fetchWithPeriod(
    client,
    locationId,
    from,
    to,
    signal,
    "financial",
    financialAnalyticsResponseSchema,
    "ANALYTICS_FINANCIAL_RESPONSE_INVALID",
  );
}

export async function fetchIncidentAnalytics(
  client: AnalyticsClient,
  locationId: string,
  from: string,
  to: string,
  signal?: AbortSignal,
): Promise<IncidentAnalyticsResponse> {
  return fetchWithPeriod(
    client,
    locationId,
    from,
    to,
    signal,
    "incidents",
    incidentAnalyticsResponseSchema,
    "ANALYTICS_INCIDENTS_RESPONSE_INVALID",
  );
}

export async function fetchQueueSnapshotForAnalytics(
  client: AnalyticsClient,
  locationId: string,
  signal?: AbortSignal,
): Promise<QueueSnapshotResponse> {
  const payload = await client.request<unknown>(
    analyticsLocationPath(locationId, "queue"),
    { signal },
  );
  return parseAnalyticsPayload(
    queueSnapshotResponseSchema,
    payload,
    "ANALYTICS_QUEUE_RESPONSE_INVALID",
  );
}

/**
 * Loads the full Analytics composition for one (location, period) identity.
 * All four requests run concurrently; the first failure rejects the entire
 * load — one coherent page state, no partial cards, no zero substitution.
 */
export async function loadAnalyticsComposition(
  client: AnalyticsClient,
  locationId: string,
  from: string,
  to: string,
  signal?: AbortSignal,
): Promise<AnalyticsComposition> {
  const [operations, financial, incidents, queue] = await Promise.all([
    fetchOperationalAnalytics(client, locationId, from, to, signal),
    fetchFinancialAnalytics(client, locationId, from, to, signal),
    fetchIncidentAnalytics(client, locationId, from, to, signal),
    fetchQueueSnapshotForAnalytics(client, locationId, signal),
  ]);
  return { financial, incidents, operations, queue };
}
