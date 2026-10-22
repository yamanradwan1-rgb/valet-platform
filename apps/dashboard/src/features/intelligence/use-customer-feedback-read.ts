"use client";

import type { CustomerFeedbackAnalyticsResponse } from "@valet/contracts";

import { useProtectedDashboard } from "../../components/foundation/protected-dashboard-context";
import {
  readCompanyCustomerFeedback,
  readLocationCustomerFeedback,
} from "./customer-feedback-api";
import { intelligenceScope } from "./intelligence-scope";
import { useIntelligenceRead } from "./use-intelligence-read";

export function useCustomerFeedbackRead(input: {
  readonly period: { readonly from: string; readonly to: string } | null;
}) {
  const dashboard = useProtectedDashboard();
  const scope = intelligenceScope(dashboard.selectedScope);
  const period = input.period;
  return useIntelligenceRead<CustomerFeedbackAnalyticsResponse>({
    descriptor: {
      endpointFamily: scope?.kind === "LOCATION" ? "LOCATION_RATINGS" : "COMPANY_RATINGS",
      from: period?.from ?? "",
      to: period?.to ?? "",
    },
    enabled: scope !== null && period !== null,
    load: ({ api, scope: readScope, signal }) => {
      if (period === null) throw new Error("Feedback period is missing.");
      return readScope.kind === "COMPANY"
        ? readCompanyCustomerFeedback(api, readScope.organizationId, period, signal)
        : readLocationCustomerFeedback(api, readScope.locationId, period, signal);
    },
  });
}
