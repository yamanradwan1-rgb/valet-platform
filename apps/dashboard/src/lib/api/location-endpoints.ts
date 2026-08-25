import {
  dashboardAuthorizedLocationsResponseSchema,
  type DashboardAuthorizedLocation,
} from "@valet/contracts";

import { DashboardApiError } from "./api-error";
import type { StaffApiClient } from "./staff-api-client";

/**
 * D2-005 — authorized-location bootstrap transport.
 *
 * GET /v1/staff/dashboard/locations via the shared authenticated
 * StaffApiClient (bearer injection, single-flight 401 refresh and error
 * mapping stay owned there). The response is validated against the shared
 * @valet/contracts schema; contract drift becomes an honest server failure
 * instead of unknown shapes reaching the UI.
 */
type LocationTransport = Pick<StaffApiClient, "request">;

export const AUTHORIZED_LOCATIONS_PATH = "/dashboard/locations";

function invalidResponseError(): DashboardApiError {
  return new DashboardApiError({
    kind: "server",
    status: 0,
    code: "AUTHORIZED_LOCATIONS_RESPONSE_INVALID",
    message: "The authorized-location response did not match the contract.",
  });
}

/**
 * Fetches the locations the authenticated manager may operate. Never
 * fabricates or filters locally: the returned list is exactly the backend
 * response (deterministic name-then-id order, possibly empty).
 */
export async function fetchAuthorizedLocations(
  transport: LocationTransport,
  signal?: AbortSignal,
): Promise<readonly DashboardAuthorizedLocation[]> {
  const payload = await transport.request<unknown>(AUTHORIZED_LOCATIONS_PATH, {
    signal,
  });
  const parsed = dashboardAuthorizedLocationsResponseSchema.safeParse(payload);
  if (!parsed.success) throw invalidResponseError();
  return parsed.data.locations;
}
