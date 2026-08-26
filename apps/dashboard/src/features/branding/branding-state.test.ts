import { describe, expect, it } from "vitest";

import type { BrandingReadResponse } from "@valet/contracts";

import { arTranslations } from "../../i18n/translations/ar";
import { enTranslations } from "../../i18n/translations/en";
import { DashboardApiError } from "../../lib/api/api-error";
import {
  BRANDING_SETTING_ORDER,
  COLOR_INPUT_PATTERN,
  DISPLAY_NAME_MAX_CODE_POINTS,
  brandingFailureMessageKey,
  buildClearBrandingRequest,
  buildSetBrandingRequest,
  findBrandingProjection,
  isBrandingConflictError,
  isSupportedBrandingSetting,
  parseBrandingInput,
} from "./branding-state";

/**
 * Pure-rule pins for the Branding surface (D4-004). The validation rules
 * mirror the shared contract EXACTLY (trim -> non-empty -> <=120 Unicode
 * CODE POINTS via Array.from -> no /\p{Cc}/u control characters; color
 * ^#[0-9A-F]{6}$ with deliberate test-pinned lowercase normalization), and
 * the conflict detector matches the exact wire code the branding backend
 * emits (CONFIGURATION_OVERRIDE_CONFLICT — there is no branding-specific
 * code).
 */

const T1 = "2026-08-22T00:00:00.000Z";

describe("supported settings", () => {
  it("exposes exactly the two contract settings in display order", () => {
    expect([...BRANDING_SETTING_ORDER]).toEqual([
      "brandDisplayName",
      "brandPrimaryColor",
    ]);
  });

  it("accepts only contract setting keys", () => {
    expect(isSupportedBrandingSetting("brandDisplayName")).toBe(true);
    expect(isSupportedBrandingSetting("brandPrimaryColor")).toBe(true);
    expect(isSupportedBrandingSetting("logo")).toBe(false);
    expect(isSupportedBrandingSetting("brandSecondaryColor")).toBe(false);
  });
});

describe("display name input rules", () => {
  it("trims surrounding whitespace and returns the trimmed value", () => {
    const outcome = parseBrandingInput("brandDisplayName", "  Nova Valet  ");
    expect(outcome).toEqual({ ok: true, value: "Nova Valet" });
  });

  it("rejects blank-after-trim input", () => {
    for (const raw of ["", "   ", "\t\n"]) {
      const outcome = parseBrandingInput("brandDisplayName", raw);
      expect(outcome).toMatchObject({
        ok: false,
        reasonKey: "branding.validation.nameInvalid",
      });
    }
  });

  it("measures the maximum in Unicode CODE POINTS, never .length", () => {
    // Each emoji is ONE code point but TWO UTF-16 units.
    const boundary = "😀".repeat(DISPLAY_NAME_MAX_CODE_POINTS);
    expect(Array.from(boundary).length).toBe(120);
    expect(boundary.length).toBe(240);
    expect(parseBrandingInput("brandDisplayName", boundary)).toMatchObject({
      ok: true,
    });
    const over = `${boundary}😀`;
    expect(Array.from(over).length).toBe(121);
    expect(parseBrandingInput("brandDisplayName", over)).toMatchObject({
      ok: false,
      reasonKey: "branding.validation.nameInvalid",
    });
  });

  it("rejects control characters", () => {
    for (const raw of ["Nova\u0007Valet", "line\nbreak", "tab\tstop"]) {
      expect(parseBrandingInput("brandDisplayName", raw)).toMatchObject({
        ok: false,
        reasonKey: "branding.validation.nameInvalid",
      });
    }
  });

  it("accepts Arabic and other non-ASCII names within the bound", () => {
    const arabic = `فاليه ${"أ".repeat(114)}`;
    expect(Array.from(arabic).length).toBe(120);
    expect(parseBrandingInput("brandDisplayName", arabic)).toMatchObject({
      ok: true,
    });
  });
});

describe("primary color input rules", () => {
  it("accepts canonical uppercase hex unchanged", () => {
    expect(parseBrandingInput("brandPrimaryColor", "#176BFF")).toEqual({
      ok: true,
      value: "#176BFF",
    });
  });

  it("normalizes lowercase six-digit hex to UPPERCASE (deliberate, pinned)", () => {
    const outcome = parseBrandingInput("brandPrimaryColor", "#176bff");
    expect(outcome).toEqual({ ok: true, value: "#176BFF" });
    expect(parseBrandingInput("brandPrimaryColor", " #abcdef ")).toEqual({
      ok: true,
      value: "#ABCDEF",
    });
  });

  it("rejects every non-contract shape", () => {
    for (const raw of [
      "#ABC",
      "#ABCDEF1",
      "#ABCDEF12",
      "176BFF",
      "rgb(0, 0, 255)",
      "hsl(220, 100%, 50%)",
      "blue",
      "#12 456",
      "",
    ]) {
      expect(parseBrandingInput("brandPrimaryColor", raw)).toMatchObject({
        ok: false,
        reasonKey: "branding.validation.colorInvalid",
      });
    }
  });

  it("keeps the canonical pattern exported for swatch safety checks", () => {
    expect(COLOR_INPUT_PATTERN.test("#176BFF")).toBe(true);
    expect(COLOR_INPUT_PATTERN.test("#176bff")).toBe(false);
  });
});

describe("request builders", () => {
  it("builds the exact set payload {setting,value,expectedUpdatedAt}", () => {
    expect(
      buildSetBrandingRequest("brandDisplayName", "Nova Valet", T1),
    ).toEqual({
      expectedUpdatedAt: T1,
      setting: "brandDisplayName",
      value: "Nova Valet",
    });
    expect(buildSetBrandingRequest("brandPrimaryColor", "#176BFF", T1)).toEqual(
      {
        expectedUpdatedAt: T1,
        setting: "brandPrimaryColor",
        value: "#176BFF",
      },
    );
  });

  it("builds the exact clear payload {setting,expectedUpdatedAt} — never a null value", () => {
    expect(buildClearBrandingRequest("brandPrimaryColor", T1)).toEqual({
      expectedUpdatedAt: T1,
      setting: "brandPrimaryColor",
    });
    expect(
      Object.hasOwn(buildClearBrandingRequest("brandDisplayName", T1), "value"),
    ).toBe(false);
  });
});

describe("projection lookup", () => {
  const data: BrandingReadResponse = {
    displayName: {
      default: "Downtown Valet",
      effective: "Nova Valet",
      override: "Nova Valet",
      overridePresent: true,
    },
    locationId: "5f0f3f4e-9d6a-4a1c-8f2e-1b2c3d4e5f60",
    primaryColor: {
      default: "#176BFF",
      effective: "#176BFF",
      override: null,
      overridePresent: false,
    },
    updatedAt: T1,
  };

  it("returns the backend-provided projections verbatim", () => {
    expect(findBrandingProjection(data, "brandDisplayName")).toBe(
      data.displayName,
    );
    expect(findBrandingProjection(data, "brandPrimaryColor")).toBe(
      data.primaryColor,
    );
  });
});

describe("conflict detection", () => {
  const conflict = new DashboardApiError({
    code: "CONFIGURATION_OVERRIDE_CONFLICT",
    kind: "conflict",
    message: "Location configuration changed concurrently.",
    status: 409,
  });

  it("matches exactly the real backend optimistic-concurrency code", () => {
    expect(isBrandingConflictError(conflict)).toBe(true);
  });

  it("never matches other conflicts, kinds or plain errors", () => {
    const otherConflictCode = new DashboardApiError({
      code: "MAP_SETUP_CONFLICT",
      kind: "conflict",
      message: "Map changed concurrently.",
      status: 409,
    });
    expect(isBrandingConflictError(otherConflictCode)).toBe(false);
    expect(isBrandingConflictError(new Error("boom"))).toBe(false);
    expect(isBrandingConflictError(null)).toBe(false);
  });
});

function apiError(
  kind: DashboardApiError["kind"],
  code: string,
  isNetworkError = false,
): DashboardApiError {
  return new DashboardApiError({
    code,
    isNetworkError,
    kind,
    message: code,
    status: 0,
  });
}

describe("failure message mapping", () => {
  it("maps every truthful failure class to its user-safe key", () => {
    expect(
      brandingFailureMessageKey(apiError("server", "NETWORK_ERROR", true)),
    ).toBe("states.networkError");
    expect(
      brandingFailureMessageKey(apiError("session-expired", "X")),
    ).toBe("errors.sessionExpired");
    expect(brandingFailureMessageKey(apiError("forbidden", "X"))).toBe(
      "errors.accessDenied",
    );
    expect(
      brandingFailureMessageKey(apiError("authorization-masked", "AUTHORIZATION_DENIED")),
    ).toBe("errors.accessDenied");
    expect(brandingFailureMessageKey(apiError("rate-limited", "X"))).toBe(
      "errors.rateLimited",
    );
    expect(
      brandingFailureMessageKey(
        apiError("validation", "CONFIGURATION_VALUE_INVALID"),
      ),
    ).toBe("branding.errors.valueInvalid");
    expect(
      brandingFailureMessageKey(apiError("validation", "REQUEST_INVALID")),
    ).toBe("branding.errors.valueInvalid");
    expect(
      brandingFailureMessageKey(
        apiError("validation", "BRANDING_REQUEST_INVALID"),
      ),
    ).toBe("branding.errors.valueInvalid");
    expect(
      brandingFailureMessageKey(apiError("validation", "SOMETHING_ELSE")),
    ).toBe("errors.requestFailed");
    expect(brandingFailureMessageKey(apiError("server", "INTERNAL_ERROR"))).toBe(
      "errors.requestFailed",
    );
    expect(brandingFailureMessageKey(new Error("raw"))).toBe(
      "errors.requestFailed",
    );
  });
});

describe("label keys resolve in both locales", () => {
  it("every setting label/description key exists in EN and AR", () => {
    for (const setting of BRANDING_SETTING_ORDER) {
      const keys = [
        setting === "brandDisplayName"
          ? "branding.setting.brandDisplayName"
          : "branding.setting.brandPrimaryColor",
        setting === "brandDisplayName"
          ? "branding.description.brandDisplayName"
          : "branding.description.brandPrimaryColor",
      ] as const;
      for (const key of keys) {
        expect(typeof enTranslations[key]).toBe("string");
        expect(typeof arTranslations[key]).toBe("string");
      }
    }
  });
});
