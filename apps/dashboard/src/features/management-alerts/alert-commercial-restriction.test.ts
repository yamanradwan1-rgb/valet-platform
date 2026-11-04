import { describe, expect, it } from "vitest";
import {
  commercialRestrictionAttentionAllowed,
  commercialRestrictionAttentionCopy,
} from "./alert-commercial-restriction";

describe("Issue 414 ALT17 restricted subscription-only surface", () => {
  const defaults = {
    authority: "COMPANY_ADMIN_SUBSCRIPTION" as const,
    dashboardAccess: false,
    loading: false,
    hasError: false,
    featureEnabled: true,
  };

  it("renders only the effective restriction in authorized CA recovery scope", () => {
    expect(commercialRestrictionAttentionAllowed(defaults)).toBe(true);
    expect(
      commercialRestrictionAttentionAllowed({
        ...defaults,
        dashboardAccess: null,
      }),
    ).toBe(true);
    expect(
      commercialRestrictionAttentionAllowed({
        ...defaults,
        dashboardAccess: true,
      }),
    ).toBe(false);
  });

  it("never opens a normal Dashboard bell or LM subscription scope", () => {
    for (const authority of [
      "COMPANY_ADMIN",
      "LOCATION_MANAGER",
      "OTHER",
    ] as const) {
      expect(
        commercialRestrictionAttentionAllowed({ ...defaults, authority }),
      ).toBe(false);
    }
    expect(
      commercialRestrictionAttentionAllowed({
        ...defaults,
        featureEnabled: false,
      }),
    ).toBe(false);
  });

  it("does not interpret errors/loading as proof of denied entitlement", () => {
    expect(
      commercialRestrictionAttentionAllowed({ ...defaults, loading: true }),
    ).toBe(false);
    expect(
      commercialRestrictionAttentionAllowed({ ...defaults, hasError: true }),
    ).toBe(false);
  });

  it("provides localized, bounded, non-secret copy", () => {
    expect(commercialRestrictionAttentionCopy.en).toContain("restricted");
    expect(commercialRestrictionAttentionCopy.ar).toContain("مقيّد");
    expect(commercialRestrictionAttentionCopy.en).not.toContain("password");
  });
});
