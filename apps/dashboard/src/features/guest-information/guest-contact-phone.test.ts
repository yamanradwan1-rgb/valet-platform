import { describe, expect, it, vi } from "vitest";
import type { DashboardApiClient } from "../../lib/api/dashboard-api-client";
import {
  saveCompanyContact,
  saveLocationContact,
} from "./guest-information-api";
import { validPhone, type ContactDefaults } from "./guest-information-model";

const organizationId = "11111111-1111-4111-8111-111111111111";
const locationId = "22222222-2222-4222-8222-222222222222";
const defaults: ContactDefaults = {
  revision: 3,
  displayName: "Synthetic desk",
  phone: "0790000000",
  supportUrl: null,
  hours: null,
  hoursConfirmed: false,
};
const inherit = { mode: "INHERIT", value: null } as const;
function client() {
  const request = vi.fn().mockResolvedValue({});
  return { api: { request } as unknown as DashboardApiClient, request };
}

describe("#339 public phone input", () => {
  it.each([
    "0790000000",
    "0780000000",
    "0770000000",
    " 079 000-0000 ",
    "+962790000000",
    " +962 (79) 000-0000 ",
    "+12025550123",
    "",
    "   ",
  ])("accepts supported synthetic input %s", (value) =>
    expect(validPhone(value)).toBe(true),
  );
  it.each([
    "079000000",
    "07900000000",
    "0710000000",
    "00962790000000",
    "+0123456789",
    "0790000000 ext 1",
    "٠٧٩٠٠٠٠٠٠٠",
    "0790000000<script>",
    "++962790000000",
    "+962790000000\n<script>",
  ])("rejects unsupported input %s", (value) =>
    expect(validPhone(value)).toBe(false),
  );

  it("normalizes Company input at serialization while preserving revision and optional hours", async () => {
    const { api, request } = client();
    await saveCompanyContact(api, organizationId, defaults);
    expect(request.mock.calls[0]?.[2]?.body).toEqual({
      expectedRevision: 3,
      values: { displayName: "Synthetic desk", phone: "+962790000000",
        supportUrl: null, hours: null, hoursConfirmed: false },
    });
  });
  it("serializes blank Company phone as null", async () => {
    const { api, request } = client();
    await saveCompanyContact(api, organizationId, { ...defaults, phone: " " });
    expect(request.mock.calls[0]?.[2]?.body.values.phone).toBeNull();
  });
  it.each(["OVERRIDE", "INHERIT", "UNAVAILABLE"] as const)(
    "normalizes only the Location OVERRIDE value: %s",
    async (mode) => {
      const { api, request } = client();
      await saveLocationContact(api, organizationId, locationId, {
        revision: 4,
        hoursConfirmed: false,
        fields: {
          displayName: inherit,
          supportUrl: inherit,
          hours: inherit,
          phone:
            mode === "OVERRIDE"
              ? { mode, value: "0790000000" }
              : { mode, value: null },
        },
      });
      expect(request.mock.calls[0]?.[2]?.body).toEqual({
        expectedRevision: 4,
        values: {
          displayName: inherit,
          supportUrl: inherit,
          hours: inherit,
          hoursConfirmed: false,
          phone: { mode, value: mode === "OVERRIDE" ? "+962790000000" : null },
        },
      });
    },
  );
});
