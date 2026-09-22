import {
  managementVisitContactCorrectionResponseSchema,
  managementVisitContactNameCorrectionRequestSchema,
  managementVisitContactPhoneCorrectionRequestSchema,
  managementVisitContactSearchQuerySchema,
  managementVisitContactSearchResponseSchema,
  managementVisitHistoryQuerySchema,
  managementVisitHistoryResponseSchema,
  type ManagementVisitContactNameCorrectionRequest,
  type ManagementVisitContactPhoneCorrectionRequest,
  type ManagementVisitContactSearchQuery,
} from "@valet/contracts";

import type { DashboardApiClient } from "../../lib/api/dashboard-api-client";

export type VisitSearchMode = "NAME" | "PHONE" | "PLATE";

export function buildVisitContactSearchQuery(input: {
  readonly cursor?: string | null;
  readonly limit?: number;
  readonly mode: VisitSearchMode;
  readonly name?: string;
  readonly phone?: string;
  readonly plate?: string;
  readonly plateCountry?: string;
}): ManagementVisitContactSearchQuery {
  const query = {
    limit: input.limit ?? 25,
    ...(input.cursor && input.mode !== "PLATE" ? { cursor: input.cursor } : {}),
    ...(input.mode === "NAME" ? { name: input.name } : {}),
    ...(input.mode === "PHONE" ? { phone: input.phone } : {}),
    ...(input.mode === "PLATE"
      ? { plate: input.plate, plateCountry: input.plateCountry }
      : {}),
  };
  return managementVisitContactSearchQuerySchema.parse(query);
}

export function searchVisitContacts(
  api: DashboardApiClient,
  organizationId: string,
  query: ManagementVisitContactSearchQuery,
  signal?: AbortSignal,
) {
  return api.request(
    `/v1/staff/management/organizations/${encodeURIComponent(organizationId)}/visit-contacts`,
    managementVisitContactSearchResponseSchema,
    { query, signal },
  );
}

export function readCustomerVisitHistory(
  api: DashboardApiClient,
  organizationId: string,
  customerId: string,
  cursor: string | null,
  signal?: AbortSignal,
) {
  const query = managementVisitHistoryQuerySchema.parse({
    limit: 25,
    ...(cursor ? { cursor } : {}),
  });
  return api.request(
    `/v1/staff/management/organizations/${encodeURIComponent(organizationId)}/visit-contacts/${encodeURIComponent(customerId)}/visits`,
    managementVisitHistoryResponseSchema,
    { query, signal },
  );
}

export function readVehicleVisitHistory(
  api: DashboardApiClient,
  organizationId: string,
  vehicleId: string,
  cursor: string | null,
  signal?: AbortSignal,
) {
  const query = managementVisitHistoryQuerySchema.parse({
    limit: 25,
    ...(cursor ? { cursor } : {}),
  });
  return api.request(
    `/v1/staff/management/organizations/${encodeURIComponent(organizationId)}/visit-vehicles/${encodeURIComponent(vehicleId)}/visits`,
    managementVisitHistoryResponseSchema,
    { query, signal },
  );
}

export function correctVisitContactName(
  api: DashboardApiClient,
  organizationId: string,
  customerId: string,
  body: ManagementVisitContactNameCorrectionRequest,
  signal?: AbortSignal,
) {
  const request = managementVisitContactNameCorrectionRequestSchema.parse(body);
  return api.request(
    `/v1/staff/management/organizations/${encodeURIComponent(organizationId)}/visit-contacts/${encodeURIComponent(customerId)}/name-correction`,
    managementVisitContactCorrectionResponseSchema,
    { body: request, method: "POST", signal },
  );
}

export function correctVisitContactPhone(
  api: DashboardApiClient,
  organizationId: string,
  customerId: string,
  body: ManagementVisitContactPhoneCorrectionRequest,
  signal?: AbortSignal,
) {
  const request = managementVisitContactPhoneCorrectionRequestSchema.parse(body);
  return api.request(
    `/v1/staff/management/organizations/${encodeURIComponent(organizationId)}/visit-contacts/${encodeURIComponent(customerId)}/phone-correction`,
    managementVisitContactCorrectionResponseSchema,
    { body: request, method: "POST", signal },
  );
}
