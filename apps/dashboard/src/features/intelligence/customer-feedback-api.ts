import {
  analyticsPeriodQuerySchema,
  customerFeedbackAnalyticsResponseSchema,
  type AnalyticsPeriodQuery,
} from "@valet/contracts";

import type { DashboardApiClient } from "../../lib/api/dashboard-api-client";

export function readLocationCustomerFeedback(
  api: DashboardApiClient,
  locationId: string,
  period: AnalyticsPeriodQuery,
  signal?: AbortSignal,
) {
  return api.request(
    `/v1/staff/dashboard/locations/${encodeURIComponent(locationId)}/analytics/ratings`,
    customerFeedbackAnalyticsResponseSchema,
    { query: analyticsPeriodQuerySchema.parse(period), signal },
  );
}

export function readCompanyCustomerFeedback(
  api: DashboardApiClient,
  organizationId: string,
  period: AnalyticsPeriodQuery,
  signal?: AbortSignal,
) {
  return api.request(
    `/v1/staff/management/organizations/${encodeURIComponent(organizationId)}/analytics/ratings`,
    customerFeedbackAnalyticsResponseSchema,
    { query: analyticsPeriodQuerySchema.parse(period), signal },
  );
}
