import { describe, expect, it } from "vitest";

import { guestSessionReadResponseSchema } from "./index.js";

const base = {
  readyAt: null,
  state: "PARKED" as const,
  valetSessionId: "11111111-1111-4111-8111-111111111111",
  vehicle: { color: null, make: null, model: null },
};

describe("Guest effective branding contract", () => {
  it("preserves safe UTF-8 display names and canonical colors", () => {
    const value = {
      ...base,
      branding: {
        displayName: "فندق عمّان",
        primaryColor: "#12ABEF",
      },
    };
    expect(guestSessionReadResponseSchema.parse(value)).toEqual(value);
  });

  it("rejects active-control names, noncanonical colors, and scope leakage", () => {
    expect(() =>
      guestSessionReadResponseSchema.parse({
        ...base,
        branding: { displayName: "Bad\nName", primaryColor: "#12ABEF" },
      }),
    ).toThrow();
    expect(() =>
      guestSessionReadResponseSchema.parse({
        ...base,
        branding: { displayName: "Safe", primaryColor: "#12abef" },
      }),
    ).toThrow();
    expect(() =>
      guestSessionReadResponseSchema.parse({
        ...base,
        branding: { displayName: "Safe", primaryColor: "#12ABEF" },
        organizationId: "22222222-2222-4222-8222-222222222222",
      }),
    ).toThrow();
  });
});
