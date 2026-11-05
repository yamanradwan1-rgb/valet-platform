import {
  managementAlertUnifiedPreviewResponseSchema,
  type ManagementAlertUnifiedPreviewResponse,
} from "@valet/contracts";
import type {
  DashboardApiClient,
  RuntimeSchema,
} from "../../lib/api/dashboard-api-client";

/**
 * Additive Phase 2/3 decoder; never starts a second polling loop.
 * The current Phase-1 decoder remains in alert-preview-api.ts.
 */
export function unifiedPreviewSchemaForLocation(
  locationId: string,
  allowOrganizationOnly: boolean,
): RuntimeSchema<ManagementAlertUnifiedPreviewResponse> {
  return {
    safeParse(value: unknown) {
      const parsed =
        managementAlertUnifiedPreviewResponseSchema.safeParse(value);
      if (!parsed.success) return { success: false, error: parsed.error };
      for (const item of parsed.data.items) {
        if (
          item.locationId !== locationId &&
          !(
            allowOrganizationOnly &&
            item.locationId === null &&
            (item.category === "ALT-15" || item.category === "ALT-17")
          )
        ) {
          return { success: false };
        }
      }
      return { success: true, data: parsed.data };
    },
  };
}

/** HTTP request is permitted only after the same live scope/session fencing. */
export function readUnifiedManagementAlertsPreview(
  api: DashboardApiClient,
  locationId: string,
  allowOrganizationOnly: boolean,
  signal: AbortSignal,
  currentAuthority?: () => boolean,
) {
  return api.request(
    `/v1/staff/dashboard/locations/${encodeURIComponent(locationId)}/alerts/preview-unified`,
    unifiedPreviewSchemaForLocation(locationId, allowOrganizationOnly),
    { signal, beforeTransport: currentAuthority },
  );
}
