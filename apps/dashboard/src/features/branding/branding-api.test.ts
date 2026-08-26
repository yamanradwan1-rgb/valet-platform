import { describe, expect, it } from "vitest";

import {
  brandingPath,
  clearBrandingOverride,
  fetchLocationBranding,
  setBrandingOverride,
  type BrandingClient,
} from "./branding-api";

/**
 * Endpoint contract pins for D4-004. Paths/methods are asserted EXACTLY as
 * reverified against apps/api/src/modules/dashboard/branding.controller.ts
 * (the shared client base URL supplies `/v1/staff`):
 * - GET  /dashboard/locations/:locationId/branding
 * - PUT  /dashboard/locations/:locationId/branding/override
 * - POST /dashboard/locations/:locationId/branding/override/clear
 */

const LOCATION_ID = "5f0f3f4e-9d6a-4a1c-8f2e-1b2c3d4e5f60";
const T1 = "2026-08-22T00:00:00.000Z";

interface RecordedRequest {
  readonly path: string;
  readonly options: {
    readonly body?: unknown;
    readonly method?: string;
    readonly signal?: AbortSignal;
  };
}

function recordingClient(
  responder: () => unknown,
): { client: BrandingClient; requests: RecordedRequest[] } {
  const requests: RecordedRequest[] = [];
  const client: BrandingClient = {
    async request<T>(path: string, options: Record<string, unknown> = {}) {
      requests.push({
        options: options as RecordedRequest["options"],
        path,
      });
      return responder() as T;
    },
  };
  return { client, requests };
}

function readPayload(): Record<string, unknown> {
  return {
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
    updatedAt: T1,
  };
}

describe("location branding endpoints", () => {
  it("builds the exact branding path under the staff API base", () => {
    expect(brandingPath(LOCATION_ID)).toBe(
      `/dashboard/locations/${LOCATION_ID}/branding`,
    );
  });

  it("GET reads the branding envelope through strict parsing", async () => {
    const { client, requests } = recordingClient(readPayload);
    const response = await fetchLocationBranding(client, LOCATION_ID);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.path).toBe(
      `/dashboard/locations/${LOCATION_ID}/branding`,
    );
    expect(requests[0]?.options.method).toBeUndefined();
    expect(response.updatedAt).toBe(T1);
    expect(response.displayName.effective).toBe("Downtown Valet");
  });

  it("rejects a drifted GET response instead of rendering unknown shapes", async () => {
    const extra = recordingClient(() => ({ ...readPayload(), extra: true }));
    await expect(
      fetchLocationBranding(extra.client, LOCATION_ID),
    ).rejects.toMatchObject({ code: "BRANDING_RESPONSE_INVALID" });
    const missingProjection = recordingClient(() => ({
      locationId: LOCATION_ID,
      primaryColor: {
        default: "#176BFF",
        effective: "#176BFF",
        override: null,
        overridePresent: false,
      },
      updatedAt: T1,
    }));
    await expect(
      fetchLocationBranding(missingProjection.client, LOCATION_ID),
    ).rejects.toMatchObject({ code: "BRANDING_RESPONSE_INVALID" });
  });

  it("PUT override sends exactly {setting,value,expectedUpdatedAt} for both arms", async () => {
    for (const variant of [
      { setting: "brandDisplayName", value: "Nova Valet" },
      { setting: "brandPrimaryColor", value: "#176BFF" },
    ] as const) {
      const { client, requests } = recordingClient(readPayload);
      await setBrandingOverride(client, LOCATION_ID, {
        ...variant,
        expectedUpdatedAt: T1,
      });
      expect(requests).toHaveLength(1);
      expect(requests[0]?.path).toBe(
        `/dashboard/locations/${LOCATION_ID}/branding/override`,
      );
      expect(requests[0]?.options.method).toBe("PUT");
      expect(requests[0]?.options.body).toEqual({
        ...variant,
        expectedUpdatedAt: T1,
      });
    }
  });

  it("refuses to send branding writes that violate the shared contract", async () => {
    for (const invalid of [
      // Missing concurrency token:
      { setting: "brandDisplayName", value: "Nova Valet" },
      // Unknown/founder setting:
      { setting: "logo", value: "x", expectedUpdatedAt: T1 },
      // Extra client-invented field:
      {
        locationId: LOCATION_ID,
        setting: "brandDisplayName",
        value: "Nova Valet",
        expectedUpdatedAt: T1,
      },
      // Lowercase hex never reaches the wire from this module (the editor
      // normalizes deliberately; a raw lowercase value is contract-invalid):
      { setting: "brandPrimaryColor", value: "#176bff", expectedUpdatedAt: T1 },
      // Wrong shapes of every banned kind:
      { setting: "brandPrimaryColor", value: "#ABC", expectedUpdatedAt: T1 },
      { setting: "brandPrimaryColor", value: "#ABCDEF12", expectedUpdatedAt: T1 },
      { setting: "brandPrimaryColor", value: "rgb(0,0,255)", expectedUpdatedAt: T1 },
      { setting: "brandPrimaryColor", value: "blue", expectedUpdatedAt: T1 },
      { setting: "brandPrimaryColor", value: 5, expectedUpdatedAt: T1 },
      // Empty-after-trim / over-long / control-char names:
      { setting: "brandDisplayName", value: "   ", expectedUpdatedAt: T1 },
      {
        setting: "brandDisplayName",
        value: "😀".repeat(121),
        expectedUpdatedAt: T1,
      },
      { setting: "brandDisplayName", value: "bad\u0007name", expectedUpdatedAt: T1 },
    ]) {
      const { client, requests } = recordingClient(readPayload);
      await expect(
        setBrandingOverride(client, LOCATION_ID, invalid as never),
      ).rejects.toMatchObject({ code: "BRANDING_REQUEST_INVALID" });
      expect(requests).toHaveLength(0);
    }
  });

  it("POST override/clear sends exactly {setting,expectedUpdatedAt} — never null", async () => {
    const { client, requests } = recordingClient(readPayload);
    await clearBrandingOverride(client, LOCATION_ID, {
      setting: "brandDisplayName",
      expectedUpdatedAt: T1,
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.path).toBe(
      `/dashboard/locations/${LOCATION_ID}/branding/override/clear`,
    );
    expect(requests[0]?.options.method).toBe("POST");
    expect(requests[0]?.options.body).toEqual({
      setting: "brandDisplayName",
      expectedUpdatedAt: T1,
    });
  });

  it("refuses to simulate clear by sending a null value", async () => {
    const { client, requests } = recordingClient(readPayload);
    await expect(
      clearBrandingOverride(client, LOCATION_ID, {
        expectedUpdatedAt: T1,
        setting: "brandPrimaryColor",
        value: null,
      } as never),
    ).rejects.toMatchObject({ code: "BRANDING_REQUEST_INVALID" });
    expect(requests).toHaveLength(0);
  });

  it("percent-encodes an odd location id into the path", () => {
    expect(brandingPath("loc ation/1?#2")).toBe(
      "/dashboard/locations/loc%20ation%2F1%3F%232/branding",
    );
  });
});
