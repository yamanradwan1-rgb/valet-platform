import { describe, expect, it, vi } from "vitest";

import type { DashboardApiClient } from "../../lib/api/dashboard-api-client";
import {
  buildVisitContactSearchQuery,
  correctVisitContactName,
  correctVisitContactPhone,
  readCustomerVisitHistory,
  readVehicleVisitHistory,
} from "./visit-contacts-api";

const org = "11111111-1111-4111-8111-111111111111";
const customer = "22222222-2222-4222-8222-222222222222";
const vehicle = "33333333-3333-4333-8333-333333333333";
const updatedAt = "2026-09-22T10:00:00.000Z";

describe("Visit Contact request contracts", () => {
  it("enforces exactly one bounded search mode", () => {
    expect(buildVisitContactSearchQuery({ mode: "NAME", name: "Jo" })).toEqual({
      limit: 25,
      name: "Jo",
    });
    expect(buildVisitContactSearchQuery({ mode: "PHONE", phone: "7" })).toEqual({
      limit: 25,
      phone: "7",
    });
    expect(buildVisitContactSearchQuery({
      mode: "PLATE",
      plate: "10-12345",
      plateCountry: "JO",
    })).toEqual({ limit: 25, plate: "10-12345", plateCountry: "JO" });
    expect(() => buildVisitContactSearchQuery({ mode: "NAME", name: "J" })).toThrow();
    expect(() => buildVisitContactSearchQuery({
      mode: "NAME", name: "x".repeat(81),
    })).toThrow();
    expect(() => buildVisitContactSearchQuery({
      mode: "PHONE", phone: "x".repeat(41),
    })).toThrow();
    expect(() => buildVisitContactSearchQuery({
      mode: "PLATE", plate: "10", plateCountry: "",
    })).toThrow();
    expect(() => buildVisitContactSearchQuery({
      limit: 51, mode: "NAME", name: "Jo",
    })).toThrow();
  });

  it("never sends continuation cursor for PLATE", () => {
    expect(buildVisitContactSearchQuery({
      cursor: "abcdefgh",
      mode: "PLATE",
      plate: "10-12345",
      plateCountry: "JO",
    })).not.toHaveProperty("cursor");
    expect(buildVisitContactSearchQuery({
      cursor: "abcdefgh",
      mode: "NAME",
      name: "John",
    })).toMatchObject({ cursor: "abcdefgh" });
  });

  it("uses only the supported history routes", async () => {
    const request = vi.fn().mockResolvedValue({ items: [], nextCursor: null });
    const api = { request } as unknown as DashboardApiClient;
    await readCustomerVisitHistory(api, org, customer, null);
    await readVehicleVisitHistory(api, org, vehicle, "abcdefgh");
    expect(request.mock.calls[0]?.[0]).toBe(
      `/v1/staff/management/organizations/${org}/visit-contacts/${customer}/visits`,
    );
    expect(request.mock.calls[1]?.[0]).toBe(
      `/v1/staff/management/organizations/${org}/visit-vehicles/${vehicle}/visits`,
    );
    expect(request.mock.calls[1]?.[2]?.query).toMatchObject({ cursor: "abcdefgh", limit: 25 });
  });

  it("sends exact CA name and phone correction bodies", async () => {
    const request = vi.fn().mockResolvedValue({
      changed: true, customerId: customer, updatedAt,
    });
    const api = { request } as unknown as DashboardApiClient;
    await correctVisitContactName(api, org, customer, {
      displayName: null,
      expectedUpdatedAt: updatedAt,
    });
    await correctVisitContactPhone(api, org, customer, {
      phone: "+962791234567",
      expectedUpdatedAt: updatedAt,
    });
    expect(request.mock.calls[0]?.[0]).toContain("/name-correction");
    expect(request.mock.calls[0]?.[2]).toMatchObject({
      body: { displayName: null, expectedUpdatedAt: updatedAt },
      method: "POST",
    });
    expect(request.mock.calls[1]?.[0]).toContain("/phone-correction");
    expect(request.mock.calls[1]?.[2]).toMatchObject({
      body: { expectedUpdatedAt: updatedAt, phone: "+962791234567" },
      method: "POST",
    });
  });
});
