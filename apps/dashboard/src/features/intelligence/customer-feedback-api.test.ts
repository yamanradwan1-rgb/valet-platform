import { describe, expect, it, vi } from "vitest";

import { DashboardApiClient } from "../../lib/api/dashboard-api-client";
import {
  readCompanyCustomerFeedback,
  readLocationCustomerFeedback,
} from "./customer-feedback-api";
import { intelligenceRequestKey } from "./intelligence-query-identity";

const period = { from: "2026-10-20", to: "2026-10-20" };

function mockApi() {
  const request = vi.fn().mockResolvedValue({});
  return { api: { request } as unknown as DashboardApiClient, request };
}

describe("Issue #313 Customer Feedback read lifecycle", () => {
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
