import { afterAll, describe, expect, it, vi } from "vitest";

import { StaffApiClient } from "../../lib/api/staff-api-client";
import {
  brandingPath,
  clearBrandingOverride,
  fetchLocationBranding,
  setBrandingOverride,
} from "./branding-api";

/**
 * INTEGRATION-LEVEL URL RESOLUTION PROOF for the D4-004 branding endpoints.
 *
 * A mock that merely records strings passed into client.request() is NOT
 * sufficient proof (staff-api-url-resolution.test.ts precedent). This suite
 * drives the REAL StaffApiClient — its own baseUrl handling and
 * template-literal construction inside staff-api-client.ts — with ONLY the
 * network boundary (globalThis.fetch) replaced by a recorder, and pins the
 * FINAL browser request URLs, proving there is no double `/v1/staff`
 * prefix.
 */

const LOCATION_ID = "5f0f3f4e-9d6a-4a1c-8f2e-1b2c3d4e5f60";
/** Exactly what api-config.getStaffApiBaseUrl() returns in the browser. */
const BROWSER_BASE = "/v1/staff";

const READ_PAYLOAD = {
  displayName: {
    default: "Downtown Valet",
    effective: "Downtown Valet",
    override: null,
    overridePresent: false,
  },
  locationId: LOCATION_ID,
  primaryColor: {
    default: "#176BFF",
    effective: "#176BFF",
    override: null,
    overridePresent: false,
  },
  updatedAt: "2026-08-22T00:00:00.000Z",
};

const EXPECTED_URLS = [
  `${BROWSER_BASE}/dashboard/locations/${LOCATION_ID}/branding`,
  `${BROWSER_BASE}/dashboard/locations/${LOCATION_ID}/branding/override`,
  `${BROWSER_BASE}/dashboard/locations/${LOCATION_ID}/branding/override/clear`,
];

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
          text: async () => JSON.stringify(READ_PAYLOAD),
        } as unknown as Response;
      },
    ),
  );
  return { methods, requestedUrls };
}

function realClient(): StaffApiClient {
  return new StaffApiClient({
    baseUrl: BROWSER_BASE,
    getAccessToken: () => "test-token",
    recoverFromUnauthorized: async () => null,
  });
}

afterAll(() => {
  vi.unstubAllGlobals();
});

describe("D4-004 final request URL resolution (real StaffApiClient)", () => {
  it("resolves all three branding endpoints to exactly one /v1/staff prefix", async () => {
    const { methods, requestedUrls } = stubFetch();
    const client = realClient();

    await fetchLocationBranding(client, LOCATION_ID);
    await setBrandingOverride(client, LOCATION_ID, {
      expectedUpdatedAt: READ_PAYLOAD.updatedAt,
      setting: "brandDisplayName",
      value: "Nova Valet",
    });
    await clearBrandingOverride(client, LOCATION_ID, {
      expectedUpdatedAt: READ_PAYLOAD.updatedAt,
      setting: "brandPrimaryColor",
    });

    expect(requestedUrls).toEqual(EXPECTED_URLS);
    expect(methods).toEqual(["GET", "PUT", "POST"]);
    expect(brandingPath(LOCATION_ID)).toBe(
      `/dashboard/locations/${LOCATION_ID}/branding`,
    );
    for (const url of requestedUrls) {
      expect(url.startsWith("/v1/staff/v1/staff/")).toBe(false);
      expect(url.startsWith("/v1/staff/dashboard/locations/")).toBe(true);
    }
  });

  it("keeps a percent-encoded odd location id encoded through the real client", async () => {
    const { requestedUrls } = stubFetch();
    await fetchLocationBranding(realClient(), "loc ation/1?#2");
    expect(requestedUrls[0]).toBe(
      `${BROWSER_BASE}/dashboard/locations/loc%20ation%2F1%3F%232/branding`,
    );
  });

  it("resolves against the server base without doubling the prefix either", async () => {
    const { requestedUrls } = stubFetch();
    const client = new StaffApiClient({
      baseUrl: "http://localhost:3000/v1/staff",
      getAccessToken: () => "test-token",
      recoverFromUnauthorized: async () => null,
    });
    await fetchLocationBranding(client, LOCATION_ID);
    expect(requestedUrls[0]).toBe(
      `http://localhost:3000/v1/staff/dashboard/locations/${LOCATION_ID}/branding`,
    );
    expect(requestedUrls[0]?.includes("/v1/staff/v1/staff")).toBe(false);
  });
});
