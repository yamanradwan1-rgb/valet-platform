import {
  managementAuditLocationQuerySchema,
  managementAuditOrganizationQuerySchema,
  managementAuditResponseSchema,
  type ManagementAuditKnownEvent,
} from "@valet/contracts";

import type { DashboardApiClient } from "../../lib/api/dashboard-api-client";
import type { AuditScope } from "./audit-scope";

export function readManagementAudit(
  api: DashboardApiClient,
  scope: AuditScope,
  input: {
    readonly cursor: string | null;
    readonly eventType: ManagementAuditKnownEvent | null;
  },
  signal?: AbortSignal,
) {
  const common = {
    limit: 50,
    ...(input.cursor ? { cursor: input.cursor } : {}),
    ...(input.eventType ? { eventType: input.eventType } : {}),
  };
  if (scope.kind === "ORGANIZATION") {
    const query = managementAuditOrganizationQuerySchema.parse(common);
    return api.request(
      `/v1/staff/management/organizations/${encodeURIComponent(scope.organizationId)}/audit-events`,
      managementAuditResponseSchema,
      { query, signal },
    );
  }
  const query = managementAuditLocationQuerySchema.parse(common);
  return api.request(
    `/v1/staff/management/organizations/${encodeURIComponent(scope.organizationId)}/locations/${encodeURIComponent(scope.locationId)}/audit-events`,
    managementAuditResponseSchema,
    { query, signal },
  );
}
