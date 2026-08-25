import {
  liveOperationsMapResponseSchema,
  type LiveOperationsMapResponse,
} from "@valet/contracts";

import { DashboardApiError } from "../../lib/api/api-error";
import type { StaffApiClient } from "../../lib/api/staff-api-client";

/**
 * Live Operations transport (D3-001).
 *
 * GET /v1/staff/locations/:locationId/live-operations-map
 *   ?limit=<1..500>&cursor=<opaque server cursor>
 * -> { items, nextCursor: string | null, observedAt }
 *
 * Re-verified against the current backend before implementation:
 * - items are active movement trackers only (IN_PROGRESS Parking/Retrieval
 *   task with a matching session state and a non-null assignee), ordered by
 *   tracker start;
 * - `position` is null whenever no GPS sample exists for the tracker — the
 *   item stays visible in operational lists but must never become a marker;
 * - `freshness` (LIVE | STALE) is computed server-side with database time
 *   against a fixed 60-second threshold (DEC-049 §7); the client never
 *   recomputes it;
 * - `observedAt` is the backend transaction time of this snapshot; it is not
 *   per-marker capturedAt and not page-load time;
 * - cursors are opaque base64url keyset tokens issued by the backend and are
 *   echoed back verbatim.
 */
export type LiveOperationsItem = LiveOperationsMapResponse["items"][number];
export type LiveOperationsVehicle = LiveOperationsItem["vehicle"];
export type LiveOperationsPosition = NonNullable<
  LiveOperationsItem["position"]
>;

export interface LiveOperationsPage {
  readonly items: readonly LiveOperationsItem[];
  readonly nextCursor: string | null;
  /** Backend snapshot time of THIS response (top-level observedAt). */
  readonly observedAt: string;
}

/**
 * Explicit page size so the request contract is visible in the URL instead of
 * relying on the backend default. Conservative: one page normally covers all
 * concurrently tracked tasks at a single location.
 */
export const LIVE_OPERATIONS_PAGE_LIMIT = 100;

export function liveOperationsPath(locationId: string): string {
  return `/locations/${locationId}/live-operations-map`;
}

function liveOperationsQuery(cursor: string | null): string {
  const params = new URLSearchParams();
  params.set("limit", String(LIVE_OPERATIONS_PAGE_LIMIT));
  if (cursor !== null && cursor.length > 0) {
    params.set("cursor", cursor);
  }
  return `?${params.toString()}`;
}

/**
 * Fetches one page and validates it against the shared contract schema.
 * Contract drift surfaces as an honest server failure instead of silently
 * rendering unknown shapes (same failure model as the overview endpoints).
 */
export async function fetchLiveOperationsPage(
  client: StaffApiClient,
  locationId: string,
  cursor: string | null,
  signal: AbortSignal,
): Promise<LiveOperationsPage> {
  const raw = await client.request<unknown>(
    `${liveOperationsPath(locationId)}${liveOperationsQuery(cursor)}`,
    { signal },
  );
  const parsed = liveOperationsMapResponseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new DashboardApiError({
      kind: "server",
      status: 0,
      code: "RESPONSE_CONTRACT_INVALID",
      message: "The backend response did not match the expected contract.",
    });
  }
  return {
    items: parsed.data.items,
    nextCursor: parsed.data.nextCursor,
    observedAt: parsed.data.observedAt,
  };
}
