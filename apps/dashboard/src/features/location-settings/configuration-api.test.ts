import { describe, expect, it } from "vitest";

import {
  clearConfigurationOverride,
  configurationPath,
  fetchLocationConfiguration,
  setConfigurationOverride,
  type ConfigurationClient,
} from "./configuration-api";

/**
 * Endpoint contract pins for D4-003. Paths/methods are asserted EXACTLY as
 * reverified against apps/api/src/modules/dashboard/
 * dashboard-configuration.controller.ts (the shared client base URL supplies
 * `/v1/staff`):
 * - GET  /dashboard/locations/:locationId/configuration
 * - PUT  /dashboard/locations/:locationId/configuration/override
 * - POST /dashboard/locations/:locationId/configuration/override/clear
 */

const LOCATION_ID = "5f0f3f4e-9d6a-4a1c-8f2e-1b2c3d4e5f60";
const ORG_ID = "11111111-2222-4333-8444-555555555555";
const T1 = "2026-08-22T00:00:00.000Z";
const T2 = "2026-08-22T01:00:00.000Z";

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
): { client: ConfigurationClient; requests: RecordedRequest[] } {
  const requests: RecordedRequest[] = [];
  const client: ConfigurationClient = {
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

function configurationPayload(): Record<string, unknown> {
  return {
    currency: "JOD",
    locationId: LOCATION_ID,
    organizationId: ORG_ID,
    settings: [
      {
        default: false,
        effective: true,
        override: true,
        overridePresent: true,
        setting: "checkInPhotosRequired",
      },
      {
        default: "0.000",
        effective: "2.500",
        override: "2.500",
        overridePresent: true,
        setting: "valetServiceFee",
      },
    ],
    timezone: "Asia/Amman",
    updatedAt: T1,
  };
}

function mutationPayload(): unknown {
  return {
    locationId: LOCATION_ID,
    result: {
      default: false,
      effective: true,
      override: true,
      overridePresent: true,
      setting: "checkInPhotosRequired",
    },
    updatedAt: T2,
  };
}

describe("location configuration endpoints", () => {
  it("builds the exact configuration path under the staff API base", () => {
    expect(configurationPath(LOCATION_ID)).toBe(
      `/dashboard/locations/${LOCATION_ID}/configuration`,
    );
  });

  it("GET reads the configuration envelope through strict parsing", async () => {
    const { client, requests } = recordingClient(configurationPayload);
    const response = await fetchLocationConfiguration(client, LOCATION_ID);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.path).toBe(
      `/dashboard/locations/${LOCATION_ID}/configuration`,
    );
    expect(requests[0]?.options.method).toBeUndefined();
    expect(response.updatedAt).toBe(T1);
    expect(response.currency).toBe("JOD");
    expect(response.settings[0]?.effective).toBe(true);
  });

  it("rejects a drifted GET response instead of rendering unknown shapes", async () => {
    const { client } = recordingClient(() => ({
      ...configurationPayload(),
      extra: true,
    }));
    await expect(
      fetchLocationConfiguration(client, LOCATION_ID),
    ).rejects.toMatchObject({ code: "CONFIGURATION_RESPONSE_INVALID" });
    const missingEffective = recordingClient(() => ({
      currency: "JOD",
      locationId: LOCATION_ID,
      organizationId: ORG_ID,
      settings: [
        {
          default: false,
          override: null,
          overridePresent: false,
          setting: "trackingEnabled",
        },
      ],
      timezone: "Asia/Amman",
      updatedAt: T1,
    }));
    await expect(
      fetchLocationConfiguration(missingEffective.client, LOCATION_ID),
    ).rejects.toMatchObject({ code: "CONFIGURATION_RESPONSE_INVALID" });
  });

  it("PUT override sends exactly {setting,value,expectedUpdatedAt}", async () => {
    const variants = [
      { setting: "checkInPhotosRequired", value: true },
      { setting: "handoffStandardMethodPolicy", value: "EITHER" },
      { setting: "trackingEnabled", value: false },
      { setting: "rawGpsRetentionDays", value: 30 },
      { setting: "valetServiceFee", value: "5.500" },
      { setting: "paymentServicePayer", value: "VENUE" },
      { setting: "paymentMethodsPolicy", value: "CASH_OR_DIGITAL" },
      { setting: "tipsEnabled", value: true },
      { setting: "validationEnabled", value: false },
      { setting: "releaseRequiresPayment", value: true },
    ] as const;
    for (const variant of variants) {
      const { client, requests } = recordingClient(mutationPayload);
      await setConfigurationOverride(client, LOCATION_ID, {
        ...variant,
        expectedUpdatedAt: T1,
      });
      expect(requests).toHaveLength(1);
      expect(requests[0]?.path).toBe(
        `/dashboard/locations/${LOCATION_ID}/configuration/override`,
      );
      expect(requests[0]?.options.method).toBe("PUT");
      expect(requests[0]?.options.body).toEqual({
        ...variant,
        expectedUpdatedAt: T1,
      });
    }
  });

  it("refuses to send override writes that violate the shared contract", async () => {
    for (const invalid of [
      // Missing concurrency token:
      { setting: "tipsEnabled", value: true },
      // Unknown/founder setting:
      { setting: "operatingHours", value: true, expectedUpdatedAt: T1 },
      // Extra client-invented field:
      {
        organizationId: ORG_ID,
        setting: "tipsEnabled",
        value: true,
        expectedUpdatedAt: T1,
      },
      // Wrong value type:
      { setting: "valetServiceFee", value: 5, expectedUpdatedAt: T1 },
      // Out-of-bounds retention:
      { setting: "rawGpsRetentionDays", value: 0, expectedUpdatedAt: T1 },
    ]) {
      const { client, requests } = recordingClient(mutationPayload);
      await expect(
        setConfigurationOverride(
          client,
          LOCATION_ID,
          invalid as never,
        ),
      ).rejects.toMatchObject({ code: "CONFIGURATION_REQUEST_INVALID" });
      expect(requests).toHaveLength(0);
    }
  });

  it("POST override/clear sends exactly {setting,expectedUpdatedAt} — never null", async () => {
    const { client, requests } = recordingClient(mutationPayload);
    await clearConfigurationOverride(client, LOCATION_ID, {
      setting: "valetServiceFee",
      expectedUpdatedAt: T1,
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.path).toBe(
      `/dashboard/locations/${LOCATION_ID}/configuration/override/clear`,
    );
    expect(requests[0]?.options.method).toBe("POST");
    expect(requests[0]?.options.body).toEqual({
      setting: "valetServiceFee",
      expectedUpdatedAt: T1,
    });
  });

  it("refuses to simulate clear by sending a null value", async () => {
    const { client, requests } = recordingClient(mutationPayload);
    await expect(
      clearConfigurationOverride(client, LOCATION_ID, {
        setting: "valetServiceFee",
        expectedUpdatedAt: T1,
        value: null,
      } as never),
    ).rejects.toMatchObject({ code: "CONFIGURATION_REQUEST_INVALID" });
    expect(requests).toHaveLength(0);
  });

  it("encodes an odd location id into every path", async () => {
    const odd = "5f0f3f4e-9d6a-4a1c-8f2e-1b2c3d4e5f60";
    const getter = recordingClient(configurationPayload);
    await fetchLocationConfiguration(getter.client, odd);
    expect(decodeURIComponent(getter.requests[0]?.path ?? "")).toContain(odd);
  });
});
