import { describe, expect, it, vi } from "vitest";

import { DashboardApiClient } from "../../lib/api/dashboard-api-client";
import { customerFeedbackAnalyticsWithCommentsResponseSchema } from "@valet/contracts";
import {
  readCompanyCustomerFeedback,
  readCompanyCustomerFeedbackWithComments,
  readLocationCustomerFeedback,
  readLocationCustomerFeedbackWithComments,
} from "./customer-feedback-api";
import { intelligenceRequestKey } from "./intelligence-query-identity";

const period = { from: "2026-10-20", to: "2026-10-20" };

function mockApi() {
  const request = vi.fn().mockResolvedValue({});
  return { api: { request } as unknown as DashboardApiClient, request };
}

describe("Issue #313 Customer Feedback read lifecycle", () => {
  it("opts in on the same exact two routes with a distinct strict response and no legacy mutation", async () => {
    const { api, request } = mockApi();
    const signal = new AbortController().signal;
    await readCompanyCustomerFeedbackWithComments(api, "org / A", period, signal);
    await readLocationCustomerFeedbackWithComments(api, "loc / A", period, signal);
    expect(request.mock.calls.map((call) => call[0])).toEqual([
      "/v1/staff/management/organizations/org%20%2F%20A/analytics/ratings",
      "/v1/staff/dashboard/locations/loc%20%2F%20A/analytics/ratings",
    ]);
    for (const call of request.mock.calls) {
      expect(call[1]).toBe(customerFeedbackAnalyticsWithCommentsResponseSchema);
      expect(call[2]).toEqual({ query: { ...period, includeComments: "true" }, signal });
    }
    await readLocationCustomerFeedback(api, "loc / A", period, signal);
    expect(request.mock.calls[2]?.[2]).toEqual({ query: period, signal });
    expect(request.mock.calls[2]?.[1]).not.toBe(customerFeedbackAnalyticsWithCommentsResponseSchema);
  });

  it("separates eager private-text representation from the legacy request generation", () => {
    const common = {
      identityGeneration: 1, retryRevision: 0, selectionRevision: 1, sessionGeneration: 2,
      scope: { kind: "LOCATION" as const, organizationId: "org", locationId: "loc" },
    };
    const legacy = intelligenceRequestKey({ ...common,
      descriptor: { endpointFamily: "LOCATION_RATINGS", ...period },
    });
    const expanded = intelligenceRequestKey({ ...common,
      descriptor: { endpointFamily: "LOCATION_RATINGS", ...period,
        representation: "WITH_COMMENTS" },
    });
    expect(expanded).not.toBe(legacy);
  });

  it("uses only existing authorized Company/Location routes with abort signals", async () => {
    const { api, request } = mockApi();
    const signal = new AbortController().signal;
    await readCompanyCustomerFeedback(api, "org / A", period, signal);
    await readLocationCustomerFeedback(api, "location / A", period, signal);
    expect(request.mock.calls.map((call) => call[0])).toEqual([
      "/v1/staff/management/organizations/org%20%2F%20A/analytics/ratings",
      "/v1/staff/dashboard/locations/location%20%2F%20A/analytics/ratings",
    ]);
    expect(request.mock.calls[0]?.[2]).toEqual({ query: period, signal });
    expect(request.mock.calls[1]?.[2]).toEqual({ query: period, signal });
  });

  it("enforces a scope-specific identity for A → B → A, retry, period, auth", () => {
    const key = (
      endpointFamily: "COMPANY_RATINGS" | "LOCATION_RATINGS",
      locationId: string | null,
      identityGeneration = 1,
      retryRevision = 0,
    ) => intelligenceRequestKey({
      descriptor: { endpointFamily, ...period },
      identityGeneration, retryRevision,
      scope: locationId === null
        ? { kind: "COMPANY", organizationId: "one" }
        : { kind: "LOCATION", organizationId: "one", locationId },
      selectionRevision: 1, sessionGeneration: 2,
    });
    const firstA = key("LOCATION_RATINGS", "A");
    expect(key("LOCATION_RATINGS", "B")).not.toBe(firstA);
    expect(key("LOCATION_RATINGS", "A", 2)).not.toBe(firstA);
    expect(key("LOCATION_RATINGS", "A", 1, 1)).not.toBe(firstA);
    expect(key("COMPANY_RATINGS", null)).not.toBe(firstA);
    expect(() => intelligenceRequestKey({
      descriptor: { endpointFamily: "COMPANY_RATINGS", ...period },
      scope: { kind: "LOCATION", organizationId: "one", locationId: "A" },
      identityGeneration: 1, retryRevision: 0,
      sessionGeneration: 2, selectionRevision: 1,
    })).toThrow(/does not match scope/);
  });
});
