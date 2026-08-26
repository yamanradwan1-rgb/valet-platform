import { afterAll, describe, expect, it, vi } from "vitest";

import { StaffApiClient } from "../../lib/api/staff-api-client";
import {
  fetchLocationSubscription,
  subscriptionPath,
} from "./subscription-api";

/**
 * INTEGRATION-LEVEL URL RESOLUTION PROOF for the D4-004 subscription read
 * endpoint (staff-api-url-resolution.test.ts precedent): the REAL
 * StaffApiClient drives the REAL production module with only globalThis.fetch
 * replaced by a recorder, and the FINAL browser request URL is pinned to be
 * exactly one `/v1/staff` prefix deep.
 */

const LOCATION_ID = "5f0f3f4e-9d6a-4a1c-8f2e-1b2c3d4e5f60";
/** Exactly what api-config.getStaffApiBaseUrl() returns in the browser. */
const BROWSER_BASE = "/v1/staff";

const PAYLOAD = {
  locationId: LOCATION_ID,
  organizationId: "99999999-8888-4777-8666-555555555555",
  subscription: null,
};

function stubFetch(): { methods: string[]; requestedUrls: string[] } {
  const methods: string[] = [];
  const requestedUrls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (
        input: RequestInfo | URL,
        init?: RequestInit,
      ): Promise<Response> => {
        const rawUrl =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;
        requestedUrls.push(rawUrl);
        methods.push(init?.method ?? "GET");
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify(PAYLOAD),
        } as unknown as Response;
      },
    ),
  );
  return { methods, requestedUrls };
}

afterAll(() => {
  vi.unstubAllGlobals();
});

describe("D4-004 subscription final request URL resolution", () => {
  it("resolves the GET to exactly one /v1/staff prefix", async () => {
    const { methods, requestedUrls } = stubFetch();
    const client = new StaffApiClient({
      baseUrl: BROWSER_BASE,
      getAccessToken: () => "test-token",
      recoverFromUnauthorized: async () => null,
    });

    await fetchLocationSubscription(client, LOCATION_ID);

    expect(subscriptionPath(LOCATION_ID)).toBe(
      `/dashboard/locations/${LOCATION_ID}/subscription`,
    );
    expect(requestedUrls).toEqual([
      `${BROWSER_BASE}/dashboard/locations/${LOCATION_ID}/subscription`,
    ]);
    // The only wire verb this surface may ever use:
    expect(methods).toEqual(["GET"]);
    expect(requestedUrls[0]?.startsWith("/v1/staff/v1/staff/")).toBe(false);
    expect(requestedUrls[0]?.startsWith("/v1/staff/dashboard/locations/")).toBe(
      true,
    );
  });
});
