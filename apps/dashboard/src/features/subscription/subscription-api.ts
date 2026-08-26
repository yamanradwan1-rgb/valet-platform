import {
  locationSubscriptionResponseSchema,
  type LocationSubscriptionResponse,
} from "@valet/contracts";

import { DashboardApiError } from "../../lib/api/api-error";
import type { StaffApiClient } from "../../lib/api/staff-api-client";

/**
 * Typed data access for the location Subscription read surface (D4-004).
 *
 * Route re-verified against
 * apps/api/src/modules/dashboard/subscription.controller.ts:
 * - GET /v1/staff/dashboard/locations/:locationId/subscription
 *
 * The `/v1/staff` prefix is supplied by the shared StaffApiClient base URL.
 *
 * This surface is READ-ONLY BY CONTRACT: the backend exposes exactly one GET
 * route and no mutation, billing, price, invoice, payment-method or customer
 * portal API of any kind. There are therefore deliberately NO mutation
 * functions here — a subscription can never be changed from this dashboard.
 * Responses are parsed strictly against the shared nullable schema so
 * contract drift becomes an honest server failure instead of unknown shapes
 * reaching the UI; `subscription: null` passes through verbatim (it means
 * only that the organization has no subscription record).
 */

export type SubscriptionClient = Pick<StaffApiClient, "request">;

/** Client path under the shared staff API base URL (`/v1/staff`). */
export function subscriptionPath(locationId: string): string {
  return `/dashboard/locations/${encodeURIComponent(locationId)}/subscription`;
}

function invalidResponseError(): DashboardApiError {
  return new DashboardApiError({
    code: "SUBSCRIPTION_RESPONSE_INVALID",
    kind: "server",
    message:
      "Location subscription response failed contract validation (SUBSCRIPTION_RESPONSE_INVALID).",
    status: 0,
  });
}

/** Loads the authoritative subscription envelope for one location. */
export async function fetchLocationSubscription(
  client: SubscriptionClient,
  locationId: string,
  signal?: AbortSignal,
): Promise<LocationSubscriptionResponse> {
  const payload = await client.request<unknown>(
    subscriptionPath(locationId),
    { signal },
  );
  const result = locationSubscriptionResponseSchema.safeParse(payload);
  if (!result.success) throw invalidResponseError();
  return result.data;
}
