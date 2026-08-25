import {
  financialOverviewResponseSchema,
  queueSnapshotResponseSchema,
  sessionStateCountsResponseSchema,
  type FinancialOverviewResponse,
  type QueueSnapshotResponse,
  type SessionStateCountsResponse,
} from "@valet/contracts";
import { DashboardApiError } from "../../lib/api/api-error";
import type { StaffApiClient } from "../../lib/api/staff-api-client";
/**
 * Typed data access for the Management Dashboard `/overview` composition.
 *
 * Endpoints verified against the current backend (apps/api dashboard module):
 * - GET /v1/staff/dashboard/locations/:locationId/overview/session-state-counts
 *   -> sessionStateCountsResponseSchema (exactly the nine canonical states,
 *      zero-filled, COMPLETED included)
 * - GET /v1/staff/dashboard/locations/:locationId/analytics/queue
 *   -> queueSnapshotResponseSchema ({ depth, oldestAgeSeconds: string | null })
 * - GET /v1/staff/dashboard/locations/:locationId/overview/financial
 *   -> financialOverviewResponseSchema (per-currency exact decimal strings)
 *
 * FAILURE MODEL (deterministic, single coherent page state): the Overview
 * loads all three requests together. If any request fails - transport error,
 * HTTP error or response-contract violation - the whole composition rejects
 * and the page renders one recoverable error state with retry. There are no
 * partial cards, no zero substitution for missing metrics and no stale mock
 * fallback. Money strings stay exact strings end to end; currencies are never
 * combined client-side.
 */

/** Minimal structural surface of the shared authenticated transport. */
export type OverviewClient = Pick<StaffApiClient, "request">;

export interface OverviewComposition {
  readonly financial: FinancialOverviewResponse;
  readonly queue: QueueSnapshotResponse;
  readonly stateCounts: SessionStateCountsResponse;
}

function locationsPath(locationId: string, suffix: string): string {
  return `/v1/staff/dashboard/locations/${encodeURIComponent(locationId)}/${suffix}`;
}

/**
 * Minimal structural view of a shared @valet/contracts Zod schema so this
 * module can validate payloads without depending on zod directly (zod is a
 * dependency of @valet/contracts, not of the dashboard app).
 */
interface ContractSchema<TData> {
  safeParse(
    value: unknown,
  ):
    | { success: true; data: TData }
    | { success: false; error: unknown };
}

/**
 * Validates a backend payload against the shared @valet/contracts schema.
 * A mismatch means backend/frontend contract drift: it becomes a normal
 * recoverable DashboardApiError (diagnostic code preserved) instead of a raw
 * ZodError reaching a user-facing render path.
 */
function parseOverviewPayload<TData>(
  schema: ContractSchema<TData>,
  payload: unknown,
  diagnosticCode: string,
): TData {
  const result = schema.safeParse(payload);
  if (!result.success) {
    throw new DashboardApiError({
      code: diagnosticCode,
      kind: "server",
      message: `Overview response failed contract validation (${diagnosticCode}).`,
      status: 0,
    });
  }
  return result.data;
}

export async function fetchSessionStateCounts(
  client: OverviewClient,
  locationId: string,
  signal?: AbortSignal,
): Promise<SessionStateCountsResponse> {
  const payload = await client.request<unknown>(
    locationsPath(locationId, "overview/session-state-counts"),
    { signal },
  );
  return parseOverviewPayload(
    sessionStateCountsResponseSchema,
    payload,
    "OVERVIEW_STATE_COUNTS_RESPONSE_INVALID",
  );
}

export async function fetchQueueSnapshot(
  client: OverviewClient,
  locationId: string,
  signal?: AbortSignal,
): Promise<QueueSnapshotResponse> {
  const payload = await client.request<unknown>(
    locationsPath(locationId, "analytics/queue"),
    { signal },
  );
  return parseOverviewPayload(
    queueSnapshotResponseSchema,
    payload,
    "OVERVIEW_QUEUE_SNAPSHOT_RESPONSE_INVALID",
  );
}

export async function fetchFinancialOverview(
  client: OverviewClient,
  locationId: string,
  signal?: AbortSignal,
): Promise<FinancialOverviewResponse> {
  const payload = await client.request<unknown>(
    locationsPath(locationId, "overview/financial"),
    { signal },
  );
  return parseOverviewPayload(
    financialOverviewResponseSchema,
    payload,
    "OVERVIEW_FINANCIAL_RESPONSE_INVALID",
  );
}

/**
 * Loads the full Overview composition. All three requests run concurrently;
 * the first failure rejects the entire load (see failure model above).
 */
export async function loadOverviewComposition(
  client: OverviewClient,
  locationId: string,
  signal?: AbortSignal,
): Promise<OverviewComposition> {
  const [stateCounts, queue, financial] = await Promise.all([
    fetchSessionStateCounts(client, locationId, signal),
    fetchQueueSnapshot(client, locationId, signal),
    fetchFinancialOverview(client, locationId, signal),
  ]);
  return { financial, queue, stateCounts };
}
