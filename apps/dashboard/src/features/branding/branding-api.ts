import {
  brandingClearRequestSchema,
  brandingReadResponseSchema,
  brandingSetRequestSchema,
  type BrandingClearRequest,
  type BrandingReadResponse,
  type BrandingSetRequest,
} from "@valet/contracts";

import { DashboardApiError } from "../../lib/api/api-error";
import type { StaffApiClient } from "../../lib/api/staff-api-client";

/**
 * Typed data access for location Branding (D4-004).
 *
 * Routes re-verified against
 * apps/api/src/modules/dashboard/branding.controller.ts:
 * - GET  /v1/staff/dashboard/locations/:locationId/branding
 * - PUT  /v1/staff/dashboard/locations/:locationId/branding/override
 * - POST /v1/staff/dashboard/locations/:locationId/branding/override/clear
 *
 * The `/v1/staff` prefix is supplied by the shared StaffApiClient base URL.
 *
 * Exactly TWO settings exist (brandDisplayName, brandPrimaryColor) and there
 * is deliberately NO company-default mutation function here: the backend
 * exposes none for this surface and Organization defaults stay read-only.
 *
 * Both mutation payloads are validated against the shared strict schemas
 * BEFORE any request is sent, so an unknown setting key, an extra field or a
 * missing expectedUpdatedAt can never reach the wire. Clearing an override is
 * only possible through the explicit clear operation — never by sending a
 * null value. Unlike configuration mutations, ALL branding mutations return
 * the FULL strict read envelope; responses are parsed strictly so contract
 * drift becomes an honest server failure instead of unknown shapes reaching
 * the UI.
 */

export type BrandingClient = Pick<StaffApiClient, "request">;

interface ContractSchema<TData> {
  safeParse(
    value: unknown,
  ):
    | { success: true; data: TData }
    | { success: false; error: unknown };
}

/** Client path under the shared staff API base URL (`/v1/staff`). */
export function brandingPath(locationId: string): string {
  return `/dashboard/locations/${encodeURIComponent(locationId)}/branding`;
}

function invalidResponseError(diagnosticCode: string): DashboardApiError {
  return new DashboardApiError({
    code: diagnosticCode,
    kind: "server",
    message: `Location branding response failed contract validation (${diagnosticCode}).`,
    status: 0,
  });
}

function parseResponse<TData>(
  schema: ContractSchema<TData>,
  payload: unknown,
  diagnosticCode: string,
): TData {
  const result = schema.safeParse(payload);
  if (!result.success) throw invalidResponseError(diagnosticCode);
  return result.data;
}

function parseRequest<TData>(
  schema: ContractSchema<TData>,
  request: TData,
): TData {
  const result = schema.safeParse(request);
  if (!result.success) {
    throw new DashboardApiError({
      code: "BRANDING_REQUEST_INVALID",
      kind: "validation",
      message:
        "Location branding request violated the shared contract and was not sent.",
      status: 0,
    });
  }
  return result.data;
}

/**
 * Loads the authoritative branding envelope for one location, including the
 * optimistic-concurrency `updatedAt` token and the backend-computed
 * per-setting projections (default / overridePresent / override / effective).
 */
export async function fetchLocationBranding(
  client: BrandingClient,
  locationId: string,
  signal?: AbortSignal,
): Promise<BrandingReadResponse> {
  const payload = await client.request<unknown>(brandingPath(locationId), {
    signal,
  });
  return parseResponse(
    brandingReadResponseSchema,
    payload,
    "BRANDING_RESPONSE_INVALID",
  );
}

/**
 * Sets ONE location override using the exact accepted request shape:
 * `{ setting, value, expectedUpdatedAt }`. The caller owns the token; this
 * module never invents or refreshes it.
 */
export async function setBrandingOverride(
  client: BrandingClient,
  locationId: string,
  request: BrandingSetRequest,
): Promise<BrandingReadResponse> {
  const body = parseRequest(brandingSetRequestSchema, request);
  const payload = await client.request<unknown>(
    `${brandingPath(locationId)}/override`,
    { body, method: "PUT" },
  );
  return parseResponse(
    brandingReadResponseSchema,
    payload,
    "BRANDING_MUTATION_RESPONSE_INVALID",
  );
}

/**
 * Clears ONE location override through the explicit clear operation with the
 * exact accepted shape `{ setting, expectedUpdatedAt }`.
 */
export async function clearBrandingOverride(
  client: BrandingClient,
  locationId: string,
  request: BrandingClearRequest,
): Promise<BrandingReadResponse> {
  const body = parseRequest(brandingClearRequestSchema, request);
  const payload = await client.request<unknown>(
    `${brandingPath(locationId)}/override/clear`,
    { body, method: "POST" },
  );
  return parseResponse(
    brandingReadResponseSchema,
    payload,
    "BRANDING_MUTATION_RESPONSE_INVALID",
  );
}
