import {
  activeShiftOverviewResponseSchema,
  incidentOverviewResponseSchema,
  keySlotOverviewResponseSchema,
  type ActiveShiftOverviewEntry,
  type IncidentOverviewEntry,
  type KeySlotOverviewEntry,
} from "@valet/contracts";

import { DashboardApiError } from "../../lib/api/api-error";
import type { StaffApiClient } from "../../lib/api/staff-api-client";

import type { OverviewListPage } from "./cursor-list-state";

/**
 * Read-only transport surface for the current backend location-overview
 * endpoints (verified against
 * `apps/api/src/modules/dashboard/overview.controller.ts`):
 *
 * - GET /dashboard/locations/:locationId/overview/active-shifts
 * - GET /dashboard/locations/:locationId/overview/keys
 * - GET /dashboard/locations/:locationId/overview/incidents
 *
 * No mutation flow exists in these dashboard endpoints, so none is exposed
 * here. Responses are parsed with the shared `@valet/contracts` schemas so a
 * contract drift fails loudly instead of leaking unexpected fields.
 */
type OverviewTransport = Pick<StaffApiClient, "request">;

function overviewResourcePath(
  locationId: string,
  resource: string,
  cursor: string | null,
): string {
  // The cursor is opaque base64url; URLSearchParams appends it safely.
  const params = new URLSearchParams();
  if (cursor !== null) params.set("cursor", cursor);
  const query = params.toString();
  return `/dashboard/locations/${encodeURIComponent(locationId)}/overview/${resource}${query.length === 0 ? "" : `?${query}`}`;
}

function invalidResponseError(): DashboardApiError {
  return new DashboardApiError({
    kind: "server",
    status: 0,
    code: "RESPONSE_INVALID",
    message: "The server response did not match the accepted contract.",
  });
}

export async function fetchActiveShiftsPage(
  transport: OverviewTransport,
  locationId: string,
  cursor: string | null,
): Promise<OverviewListPage<ActiveShiftOverviewEntry>> {
  // Options are intentionally omitted: StaffApiClient defaults to GET with
  // no body, which is the only method these read surfaces may ever use.
  const payload = await transport.request<unknown>(
    overviewResourcePath(locationId, "active-shifts", cursor),
  );
  const parsed = activeShiftOverviewResponseSchema.safeParse(payload);
  if (!parsed.success) throw invalidResponseError();
  return parsed.data;
}

export async function fetchKeySlotsPage(
  transport: OverviewTransport,
  locationId: string,
  cursor: string | null,
): Promise<OverviewListPage<KeySlotOverviewEntry>> {
  const payload = await transport.request<unknown>(
    overviewResourcePath(locationId, "keys", cursor),
  );
  const parsed = keySlotOverviewResponseSchema.safeParse(payload);
  if (!parsed.success) throw invalidResponseError();
  return parsed.data;
}

export async function fetchIncidentsPage(
  transport: OverviewTransport,
  locationId: string,
  cursor: string | null,
): Promise<OverviewListPage<IncidentOverviewEntry>> {
  const payload = await transport.request<unknown>(
    overviewResourcePath(locationId, "incidents", cursor),
  );
  const parsed = incidentOverviewResponseSchema.safeParse(payload);
  if (!parsed.success) throw invalidResponseError();
  return parsed.data;
}
