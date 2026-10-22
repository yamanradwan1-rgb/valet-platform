import { describe, expect, it } from "vitest";

import {
  contactCounts, effectiveContact, policyStatus, validHttps, validPhone,
  visiblePolicy, type ContactDefaults, type LocationContact, type LocationPrivacy,
} from "./guest-information-model";

const defaults: ContactDefaults = {
  displayName: "Company Guest Desk",
  phone: "+962799000000",
  supportUrl: "https://example.com/contact",
  hours: "Sun–Thu 09:00–17:00",
  hoursConfirmed: true,
  revision: 2,
};
const inherited: LocationContact = {
  fields: {
    displayName: { mode: "INHERIT", value: null },
    phone: { mode: "INHERIT", value: null },
    supportUrl: { mode: "INHERIT", value: null },
    hours: { mode: "INHERIT", value: null },
  },
  hoursConfirmed: false,
  revision: 0,
};
const noPolicy = { text: "", url: "" };
const arabicPolicy = { text: "سياسة الموقع المعتمدة", url: "" };
const privacy: LocationPrivacy = {
  drafts: { en: noPolicy, ar: { text: "مسودة غير منشورة", url: "" } },
  published: { en: noPolicy, ar: arabicPolicy },
  revision: 3,
  version: 1,
  updatedAt: "2026-10-22T12:00:00.000Z",
};

describe("guest-information customer-visible projection", () => {
  it("never substitutes an unpublished English draft for a published Arabic snapshot", () => {
    expect(policyStatus(privacy, "en")).toBe("UNAVAILABLE");
    expect(visiblePolicy(privacy, "en")).toBeNull();
    expect(policyStatus(privacy, "ar")).toBe("PUBLISHED");
    expect(visiblePolicy(privacy, "ar")).toEqual(arabicPolicy);
  });

  it("distinguishes no publication, a draft, and a published version", () => {
    const unpublished: LocationPrivacy = {
      ...privacy, published: null, version: 0,
    };
    expect(policyStatus(unpublished, "ar")).toBe("DRAFT");
    expect(policyStatus({
      ...unpublished, drafts: { en: noPolicy, ar: noPolicy },
    }, "ar")).toBe("NOT_SET");
  });

  it("honors unavailable overrides without falling back to the company, including hours", () => {
    const local: LocationContact = {
      ...inherited,
      fields: {
        ...inherited.fields,
        phone: { mode: "UNAVAILABLE", value: null },
        hours: { mode: "OVERRIDE", value: "Fri 10:00–15:00" },
      },
      hoursConfirmed: false,
    };
    expect(effectiveContact(defaults, local, "phone")).toEqual({
      value: null, source: "Location",
    });
    expect(effectiveContact(defaults, local, "hours").value).toBeNull();
    expect(effectiveContact(defaults, inherited, "hours").value)
      .toBe("Sun–Thu 09:00–17:00");
    expect(contactCounts(defaults, local)).toEqual({
      configured: 2, customized: 2,
    });
  });

  it("rejects URLs with embedded credentials and invalid international phone numbers", () => {
    expect(validHttps("https://user:pass@example.com")).toBe(false);
    expect(validHttps("javascript:alert(1)")).toBe(false);
    expect(validHttps("https://example.com/support")).toBe(true);
    expect(validPhone("+962799000000")).toBe(true);
    expect(validPhone("0799000000")).toBe(false);
  });
});
