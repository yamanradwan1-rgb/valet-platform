import { describe, expect, it } from "vitest";

import {
  guestInformationResponseSchema,
  guestInformationHttpsUrlSchema,
  guestContactLocationValuesSchema,
  managementGuestPrivacyResponseSchema,
  managementGuestInformationOverviewResponseSchema,
} from "./index.js";

const id = "b7c59e3f-6079-4980-b384-eb078a966d0e";

describe("#316 Guest information contracts", () => {
  it("rejects unsafe links including credential and backslash confusion", () => {
    for (const value of [
      "http://example.com/path",
      "https://tenant.example@evil.example/path",
      "https://tenant.example\\@evil.example/path",
      "https://user:password@evil.example/",
      "https://example.com:0/legal",
      "https://example.com:65536/legal",
    ]) {
      expect(guestInformationHttpsUrlSchema.safeParse(value).success).toBe(
        false,
      );
    }
    expect(
      guestInformationHttpsUrlSchema.parse("https://example.com/legal?lang=ar"),
    ).toBe("https://example.com/legal?lang=ar");
    expect(
      guestInformationHttpsUrlSchema.parse("HTTPS://EXAMPLE.COM/support"),
    ).toBe("https://example.com/support");
    expect(
      guestInformationHttpsUrlSchema.parse("https://example.com:8443/legal"),
    ).toBe("https://example.com:8443/legal");
    expect(
      guestInformationHttpsUrlSchema.parse("https://مثال.إختبار/الشروط"),
    ).toMatch(/^https:\/\/xn--[^/]+\//);
  });

  it("keeps each Contact override mode explicit and values non-empty", () => {
    const value = {
      displayName: { mode: "INHERIT", value: null },
      phone: { mode: "UNAVAILABLE", value: null },
      supportUrl: { mode: "OVERRIDE", value: "https://example.com/support" },
      hours: { mode: "INHERIT", value: null },
      hoursConfirmed: false,
    };
    expect(guestContactLocationValuesSchema.safeParse(value).success).toBe(
      true,
    );
    expect(
      guestContactLocationValuesSchema.safeParse({
        ...value,
        phone: { mode: "OVERRIDE", value: null },
      }).success,
    ).toBe(false);
    expect(
      guestContactLocationValuesSchema.safeParse({
        ...value,
        hoursConfirmed: true,
      }).success,
    ).toBe(false);
  });

  it("represents a completely unconfigured Location honestly", () => {
    expect(
      managementGuestPrivacyResponseSchema.parse({
        organizationId: id,
        locationId: id,
        revision: 0,
        updatedAt: null,
        drafts: { en: { text: "", url: "" }, ar: { text: "", url: "" } },
        published: null,
        publishedVersion: null,
        publishedAt: null,
      }).revision,
    ).toBe(0);
    const guest = guestInformationResponseSchema.parse({
      locale: "ar",
      privacy: {
        status: "UNAVAILABLE",
        text: null,
        url: null,
        version: null,
        publishedAt: null,
      },
      contact: {
        displayName: null,
        phone: null,
        supportUrl: null,
        hours: null,
      },
    });
    expect(guest.privacy.text).toBeNull();
    expect(
      guestInformationResponseSchema.safeParse({
        ...guest,
        privacy: { ...guest.privacy, text: "draft leaked" },
      }).success,
    ).toBe(false);
  });

  it("never reports published counts beyond authorized visible Locations", () => {
    const value = {
      companyName: "Tenant company",
      locations: [
        {
          id,
          name: "Authorized site",
          privacy: "DRAFT",
          contact: "NOT_SET",
        },
      ],
      publishedCount: 0,
    };
    expect(
      managementGuestInformationOverviewResponseSchema.parse(value),
    ).toEqual(value);
    expect(
      managementGuestInformationOverviewResponseSchema.safeParse({
        ...value,
        publishedCount: 2,
      }).success,
    ).toBe(false);
  });
});
