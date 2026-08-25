import {
  clearConfigurationOverrideRequestSchema,
  configurationMutationResponseSchema,
  locationConfigurationResponseSchema,
  setConfigurationOverrideRequestSchema,
  type ClearConfigurationOverrideRequest,
  type ConfigurationMutationResponse,
  type LocationConfigurationResponse,
  type SetConfigurationOverrideRequest,
} from "@valet/contracts";

import { DashboardApiError } from "../../lib/api/api-error";
import type { StaffApiClient } from "../../lib/api/staff-api-client";

/**
 * Typed data access for Location Settings (D4-003).
 *
 * Routes re-verified against
 * apps/api/src/modules/dashboard/dashboard-configuration.controller.ts:
 * - GET  /v1/staff/dashboard/locations/:locationId/configuration
 * - PUT  /v1/staff/dashboard/locations/:locationId/configuration/override
 * - POST /v1/staff/dashboard/locations/:locationId/configuration/override/clear
 *
 * The `/v1/staff` prefix is supplied by the shared StaffApiClient base URL.
 * There are deliberately NO company-default mutation functions here: the
 * backend exposes none for this surface and Organization defaults stay
 * read-only in this UI (password-only ORG_ADMIN authority is out of scope).
 *
 * Both mutation payloads are validated against the shared strict schemas
 * BEFORE any request is sent, so an unknown setting key, an extra field or a
 * missing expectedUpdatedAt can never reach the wire. Clearing an override is
 * only possible through the explicit clear operation — never by sending a
 * null value. Responses are parsed strictly; contract drift becomes an honest
 * server failure instead of unknown shapes reaching the UI.
 */

export type ConfigurationClient = Pick<StaffApiClient, "request">;

interface ContractSchema<TData> {
  safeParse(
    value: unknown,
  ):
    | { success: true; data: TData }
    | { success: false; error: unknown };
}

/** Client path under the shared staff API base URL (`/v1/staff`). */
export function configurationPath(locationId: string): string {
  return `/dashboard/locations/${encodeURIComponent(locationId)}/configuration`;
}

function invalidResponseError(diagnosticCode: string): DashboardApiError {
  return new DashboardApiError({
    code: diagnosticCode,
    kind: "server",
    message: `Location configuration response failed contract validation (${diagnosticCode}).`,
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
      code: "CONFIGURATION_REQUEST_INVALID",
      kind: "validation",
      message:
        "Location configuration request violated the shared contract and was not sent.",
      status: 0,
    });
  }
  return result.data;
}

/**
 * Loads the authoritative configuration envelope for one location,
 * including the optimistic-concurrency `updatedAt` token, the read-only
 * location currency/timezone metadata and the backend-computed per-setting
 * projections (default / overridePresent / override / effective).
 */
export async function fetchLocationConfiguration(
  client: ConfigurationClient,
  locationId: string,
  signal?: AbortSignal,
): Promise<LocationConfigurationResponse> {
  const payload = await client.request<unknown>(configurationPath(locationId), {
    signal,
  });
  return parseResponse(
    locationConfigurationResponseSchema,
    payload,
    "CONFIGURATION_RESPONSE_INVALID",
  );
}

/**
 * Sets ONE location override using the exact accepted request shape:
 * `{ setting, value, expectedUpdatedAt }`. The caller owns the token; this
 * module never invents or refreshes it.
 */
export async function setConfigurationOverride(
  client: ConfigurationClient,
  locationId: string,
  request: SetConfigurationOverrideRequest,
): Promise<ConfigurationMutationResponse> {
  const body = parseRequest(setConfigurationOverrideRequestSchema, request);
  const payload = await client.request<unknown>(
    `${configurationPath(locationId)}/override`,
    { body, method: "PUT" },
  );
  return parseResponse(
    configurationMutationResponseSchema,
    payload,
    "CONFIGURATION_MUTATION_RESPONSE_INVALID",
  );
}

/**
 * Clears ONE location override through the explicit clear operation with the
 * exact accepted shape `{ setting, expectedUpdatedAt }`.
 */
export async function clearConfigurationOverride(
  client: ConfigurationClient,
  locationId: string,
  request: ClearConfigurationOverrideRequest,
): Promise<ConfigurationMutationResponse> {
  const body = parseRequest(clearConfigurationOverrideRequestSchema, request);
  const payload = await client.request<unknown>(
    `${configurationPath(locationId)}/override/clear`,
    { body, method: "POST" },
  );
  return parseResponse(
    configurationMutationResponseSchema,
    payload,
    "CONFIGURATION_MUTATION_RESPONSE_INVALID",
  );
}
