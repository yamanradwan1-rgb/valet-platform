import { describe, expect, it } from "vitest";

import type { LocationConfigurationResponse } from "@valet/contracts";

import { DashboardApiError } from "../../lib/api/api-error";
import {
  CONFIGURATION_SETTING_ORDER,
  RETENTION_DAYS_MAXIMUM,
  RETENTION_DAYS_MINIMUM,
  applyMutationResponse,
  buildClearOverrideRequest,
  buildSetOverrideRequest,
  configurationFailureMessageKey,
  findConfigurationSetting,
  isConfigurationConflictError,
  isSupportedConfigurationSetting,
  MONEY_INPUT_PATTERN,
  parseSettingInput,
} from "./configuration-state";

const T1 = "2026-08-22T00:00:00.000Z";
const T2 = "2026-08-22T01:00:00.000Z";
const LOCATION_ID = "5f0f3f4e-9d6a-4a1c-8f2e-1b2c3d4e5f60";
const ORG_ID = "11111111-2222-4333-8444-555555555555";

describe("supported setting inventory", () => {
  it("contains EXACTLY the ten contract settings", () => {
    expect([...CONFIGURATION_SETTING_ORDER]).toEqual([
      "checkInPhotosRequired",
      "handoffStandardMethodPolicy",
      "trackingEnabled",
      "rawGpsRetentionDays",
      "valetServiceFee",
      "paymentServicePayer",
      "paymentMethodsPolicy",
      "tipsEnabled",
      "validationEnabled",
      "releaseRequiresPayment",
    ]);
  });

  it("rejects unsupported Category-B/founder settings", () => {
    const unsupported = [
      "operatingHours", "languageDefault", "plateScanPolicy",
      "keySystemPolicy", "parkingSpotRequirement", "geofenceAlerts",
      "notificationTemplates", "slaTargetMinutes", "allowedRoles",
      "currency", "timezone",
    ];
    for (const key of unsupported) {
      expect(isSupportedConfigurationSetting(key)).toBe(false);
    }
    for (const key of CONFIGURATION_SETTING_ORDER) {
      expect(isSupportedConfigurationSetting(key)).toBe(true);
    }
  });
});

describe("setting input validation", () => {
  it("accepts only real booleans for toggle settings", () => {
    expect(parseSettingInput("tipsEnabled", true)).toEqual({ ok: true, value: true });
    expect(parseSettingInput("tipsEnabled", "true" as never)).toMatchObject({ ok: false });
  });

  it("enforces the exact accepted integer bounds for retention days", () => {
    expect(RETENTION_DAYS_MINIMUM).toBe(1);
    expect(RETENTION_DAYS_MAXIMUM).toBe(2_147_483_647);
    expect(parseSettingInput("rawGpsRetentionDays", "30")).toEqual({
      ok: true,
      value: 30,
    });
    // Canonical integer semantics: leading zeros normalize to the SAME
    // contract integer ("007" -> 7); "1.5" is rejected, never coerced to 1.
    expect(parseSettingInput("rawGpsRetentionDays", "007")).toEqual({
      ok: true,
      value: 7,
    });
    for (const invalid of ["0", "-3", "1.5", "abc", "", "2147483648"]) {
      expect(parseSettingInput("rawGpsRetentionDays", invalid)).toMatchObject({
        ok: false,
      });
    }
  });

  it("keeps money an exact decimal string and never converts it", () => {
    for (const valid of ["5.500", "12.5", "0", "0.123", "5"]) {
      expect(MONEY_INPUT_PATTERN.test(valid)).toBe(true);
    }
    // NOTE: whole-number strings like "5" are contract-valid; the NUMBER 5
    // is rejected by type (pinned separately below).
    for (const invalid of ["-1.000", "01.5", "1.2345", "abc", "", "+5"]) {
      expect(MONEY_INPUT_PATTERN.test(invalid)).toBe(false);
    }
    const outcome = parseSettingInput("valetServiceFee", " 5.500 ");
    expect(outcome).toEqual({ ok: true, value: "5.500" });
    expect(typeof (outcome as { value?: unknown }).value).toBe("string");
  });

  it("accepts only enum members for policy settings", () => {
    expect(parseSettingInput("handoffStandardMethodPolicy", "EITHER")).toEqual({
      ok: true,
      value: "EITHER",
    });
    expect(parseSettingInput("paymentServicePayer", "COMPANY")).toMatchObject({ ok: false });
    expect(parseSettingInput("paymentMethodsPolicy", "BAR_ONLY")).toMatchObject({ ok: false });
  });
});

describe("exact mutation payloads", () => {
  it("builds the exact set payload with the captured token", () => {
    expect(buildSetOverrideRequest("valetServiceFee", "5.500", T1)).toEqual({
      setting: "valetServiceFee",
      value: "5.500",
      expectedUpdatedAt: T1,
    });
    expect(buildSetOverrideRequest("trackingEnabled", false, T1)).toEqual({
      expectedUpdatedAt: T1,
      setting: "trackingEnabled",
      value: false,
    });
    expect(buildSetOverrideRequest("rawGpsRetentionDays", 14, T1)).toEqual({
      expectedUpdatedAt: T1,
      setting: "rawGpsRetentionDays",
      value: 14,
    });
  });

  it("builds the exact clear payload without any null simulation", () => {
    expect(buildClearOverrideRequest("valetServiceFee", T1)).toEqual({
      setting: "valetServiceFee",
      expectedUpdatedAt: T1,
    });
    expect(
      Object.keys(buildClearOverrideRequest("tipsEnabled", T1)),
    ).toEqual(["setting", "expectedUpdatedAt"]);
  });

  it("refuses values whose type contradicts the setting", () => {
    expect(() =>
      buildSetOverrideRequest("valetServiceFee", 5 as never, T1),
    ).toThrow();
    expect(() =>
      buildSetOverrideRequest("tipsEnabled", "yes" as never, T1),
    ).toThrow();
  });
});

function baseConfiguration(): LocationConfigurationResponse {
  return {
    currency: "JOD",
    locationId: LOCATION_ID,
    organizationId: ORG_ID,
    settings: [
      {
        default: false,
        effective: false,
        override: null,
        overridePresent: false,
        setting: "checkInPhotosRequired",
      },
      {
        default: "0.000",
        effective: "0.000",
        override: null,
        overridePresent: false,
        setting: "valetServiceFee",
      },
      {
        default: true,
        effective: true,
        override: null,
        overridePresent: false,
        setting: "tipsEnabled",
      },
    ],
    timezone: "Asia/Amman",
    updatedAt: T1,
  };
}

describe("authoritative mutation application", () => {
  it("replaces ONLY the mutated setting and advances the stored token", () => {
    const current = baseConfiguration();
    const next = applyMutationResponse(current, {
      locationId: LOCATION_ID,
      result: {
        default: "0.000",
        effective: "2.500",
        override: "2.500",
        overridePresent: true,
        setting: "valetServiceFee",
      },
      updatedAt: T2,
    });
    expect(next.updatedAt).toBe(T2);
    expect(findConfigurationSetting(next, "valetServiceFee")?.effective).toBe(
      "2.500",
    );
    // Other settings are untouched by a one-setting mutation:
    expect(findConfigurationSetting(next, "checkInPhotosRequired")).toEqual(
      current.settings[0],
    );
    expect(findConfigurationSetting(next, "tipsEnabled")).toEqual(
      current.settings[2],
    );
  });

  it("consumes the backend effective value verbatim (no recompute)", () => {
    const current = baseConfiguration();
    // Deliberately "inconsistent" projection: the BACKEND is authoritative
    // even if effective !== override ?? default locally.
    const next = applyMutationResponse(current, {
      locationId: LOCATION_ID,
      result: {
        default: false,
        effective: true,
        override: null,
        overridePresent: false,
        setting: "checkInPhotosRequired",
      },
      updatedAt: T2,
    });
    expect(
      findConfigurationSetting(next, "checkInPhotosRequired"),
    ).toEqual({
      default: false,
      effective: true,
      override: null,
      overridePresent: false,
      setting: "checkInPhotosRequired",
    });
  });

  it("preserves exact fee decimal text through the application", () => {
    const next = applyMutationResponse(baseConfiguration(), {
      locationId: LOCATION_ID,
      result: {
        default: "0.000",
        effective: "12.345",
        override: "12.345",
        overridePresent: true,
        setting: "valetServiceFee",
      },
      updatedAt: T2,
    });
    const fee = findConfigurationSetting(next, "valetServiceFee");
    expect(fee?.effective).toBe("12.345");
    expect(fee?.override).toBe("12.345");
  });
});

describe("failure mapping", () => {
  function apiError(
    kind: ConstructorParameters<typeof DashboardApiError>[0]["kind"],
    code: string,
    isNetworkError?: boolean,
  ): DashboardApiError {
    return new DashboardApiError({
      code,
      isNetworkError,
      kind,
      message: "x",
      status: 0,
    });
  }

  it("maps conflict detection to exactly CONFIGURATION_OVERRIDE_CONFLICT", () => {
    expect(
      isConfigurationConflictError(
        apiError("conflict", "CONFIGURATION_OVERRIDE_CONFLICT"),
      ),
    ).toBe(true);
    expect(isConfigurationConflictError(apiError("conflict", "OTHER"))).toBe(false);
    expect(isConfigurationConflictError(new Error("x"))).toBe(false);
  });

  it("maps every transport failure to a truthful user-safe posture", () => {
    expect(configurationFailureMessageKey(new Error("boom"))).toBe(
      "errors.requestFailed",
    );
    expect(configurationFailureMessageKey(apiError("server", "NET", true)))
      .toBe("states.networkError");
    expect(
      configurationFailureMessageKey(
        apiError("session-expired", "STAFF_AUTHENTICATION_FAILED"),
      ),
    ).toBe("errors.sessionExpired");
    expect(
      configurationFailureMessageKey(apiError("authorization-masked", "AUTHORIZATION_DENIED")),
    ).toBe("errors.accessDenied");
    expect(configurationFailureMessageKey(apiError("rate-limited", "RATE")))
      .toBe("errors.rateLimited");
    expect(
      configurationFailureMessageKey(
        apiError("validation", "CONFIGURATION_VALUE_INVALID"),
      ),
    ).toBe("config.errors.valueInvalid");
    expect(configurationFailureMessageKey(apiError("server", "SOMETHING_ELSE")))
      .toBe("errors.requestFailed");
  });
});
