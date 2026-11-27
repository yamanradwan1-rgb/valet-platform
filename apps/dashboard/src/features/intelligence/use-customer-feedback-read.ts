"use client";

import type { CustomerFeedbackAnalyticsWithCommentsResponse } from "@valet/contracts";

import { useProtectedDashboard } from "../../components/foundation/protected-dashboard-context";
import {
  readCompanyCustomerFeedbackWithComments,
  readLocationCustomerFeedbackWithComments,
} from "./customer-feedback-api";
import { intelligenceScope } from "./intelligence-scope";
import { useIntelligenceRead } from "./use-intelligence-read";

export function useCustomerFeedbackRead(input: {
  readonly period: { readonly from: string; readonly to: string } | null;
}) {
  const dashboard = useProtectedDashboard();
  const scope = intelligenceScope(dashboard.selectedScope);
  const period = input.period;
  return useIntelligenceRead<CustomerFeedbackAnalyticsWithCommentsResponse>({
    descriptor: {
      endpointFamily: scope?.kind === "LOCATION" ? "LOCATION_RATINGS" : "COMPANY_RATINGS",
      representation: "WITH_COMMENTS",
      from: period?.from ?? "",
      to: period?.to ?? "",
    },
    enabled: scope !== null && period !== null,
    load: ({ api, scope: readScope, signal }) => {
      if (period === null) throw new Error("Feedback period is missing.");
      return readScope.kind === "COMPANY"
        ? readCompanyCustomerFeedbackWithComments(api, readScope.organizationId, period, signal)
        : readLocationCustomerFeedbackWithComments(api, readScope.locationId, period, signal);
    },
  });
}
