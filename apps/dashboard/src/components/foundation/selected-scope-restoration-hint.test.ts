import { describe, expect, it, vi } from "vitest";

import type { SelectedDashboardScope } from "../scope";
import {
  SELECTED_SCOPE_RESTORATION_KEY,
  parseSelectedScopeRestorationHint,
  readSelectedScopeRestorationHint,
  removeSelectedScopeRestorationHint,
  restorationHintFromScope,
  writeSelectedScopeRestorationHint,
  type ScopeRestorationStorage,
} from "./selected-scope-restoration-hint";

const sessionId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const organizationId = "11111111-1111-4111-8111-111111111111";
const locationId = "22222222-2222-4222-8222-222222222222";
const membershipId = "33333333-3333-4333-8333-333333333333";
const shiftId = "44444444-4444-4444-8444-444444444444";
const organization = { organizationId, name: "Org", timezone: "Asia/Amman" };
const location = {
  locationId,
  name: "Location",
  code: "LOC",
  status: "ACTIVE" as const,
  timezone: "Asia/Amman",
  currency: "JOD",
};

function scope(authority: SelectedDashboardScope["authority"]): SelectedDashboardScope {
  if (authority === "COMPANY_ADMIN") {
    return {
      authority,
      context: {
        capabilities: [],
        organization,
        scope: { kind: "LOCATION", locationId },
        selectedLocation: location,
      },
    };
  }
  if (authority === "COMPANY_ADMIN_SUBSCRIPTION") return { authority, organization };
  if (authority === "LOCATION_MANAGER") return { authority, organization, location };
  if (authority === "LOCATION_MANAGER_GRANT_SET") return { authority, organization };
  return {
    authority,
    context: {
      authority,
      membershipId,
      organization: { organizationId, name: organization.name },
      location: {
        code: location.code,
        currency: location.currency,
        locationId,
        name: location.name,
        timezone: location.timezone,
      },
      activeShift: {
        locationId,
        shiftId,
        startedAt: "2026-10-06T10:00:00Z",
        status: "ACTIVE",
      },
    },
  };
}

function memoryStorage(): ScopeRestorationStorage & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
  };
}

describe("selected scope restoration hint", () => {
  it("round-trips only minimal identifiers for every supported selected-scope variant", () => {
    for (const authority of [
      "COMPANY_ADMIN",
      "COMPANY_ADMIN_SUBSCRIPTION",
      "LOCATION_MANAGER",
      "LOCATION_MANAGER_GRANT_SET",
      "SUPERVISOR",
    ] as const) {
      const hint = restorationHintFromScope(scope(authority), sessionId);
      expect(hint).not.toBeNull();
      const parsed = parseSelectedScopeRestorationHint(JSON.stringify(hint));
      expect(parsed).toEqual({ kind: "valid", hint });
    }
  });

  it("supports Company Admin ALL_LOCATIONS without inventing a Location", () => {
    const selected: SelectedDashboardScope = {
      authority: "COMPANY_ADMIN",
      context: {
        capabilities: ["COMPANY_DASHBOARD_READ"],
        organization,
        scope: { kind: "ALL_LOCATIONS" },
        selectedLocation: null,
      },
    };
    expect(restorationHintFromScope(selected, sessionId)).toEqual({
      authority: "COMPANY_ADMIN",
      organizationId,
      scope: { kind: "ALL_LOCATIONS" },
      staffAuthSessionId: sessionId,
      version: 1,
    });
  });

  it("persists no token, names, status, capabilities, subscription, route authority, or shift object", () => {
    const raw = JSON.stringify(restorationHintFromScope(scope("SUPERVISOR"), sessionId));
    for (const forbidden of [
      "accessToken",
      "refreshToken",
      "capabilities",
      "subscription",
      "routeAccess",
      "Location",
      "ACTIVE",
      "startedAt",
      "activeShift",
    ]) expect(raw).not.toContain(forbidden);
  });

  it.each([
    ["malformed JSON", "{"],
    ["wrong version", JSON.stringify({ version: 2 })],
    ["unknown authority", JSON.stringify({ version: 1, authority: "ROOT", organizationId, staffAuthSessionId: sessionId })],
    ["missing required ID", JSON.stringify({ version: 1, authority: "LOCATION_MANAGER", organizationId, staffAuthSessionId: sessionId })],
    ["invalid identifier", JSON.stringify({ version: 1, authority: "LOCATION_MANAGER", organizationId, locationId: "", staffAuthSessionId: sessionId })],
    ["extra field", JSON.stringify({ version: 1, authority: "COMPANY_ADMIN_SUBSCRIPTION", organizationId, staffAuthSessionId: sessionId, name: "Old" })],
  ])("rejects %s", (_label, raw) => {
    expect(parseSelectedScopeRestorationHint(raw)).toEqual({ kind: "invalid" });
  });

  it("reads, writes, and removes the strict sessionStorage record", () => {
    const storage = memoryStorage();
    const hint = restorationHintFromScope(scope("LOCATION_MANAGER"), sessionId)!;
    expect(writeSelectedScopeRestorationHint(hint, storage)).toBe(true);
    expect(storage.values.has(SELECTED_SCOPE_RESTORATION_KEY)).toBe(true);
    expect(readSelectedScopeRestorationHint(storage)).toEqual({ kind: "valid", hint });
    expect(removeSelectedScopeRestorationHint(storage)).toBe(true);
    expect(readSelectedScopeRestorationHint(storage)).toEqual({ kind: "missing" });
  });

  it("fails closed when storage read, write, or remove throws", () => {
    const error = new Error("blocked");
    const storage = {
      getItem: vi.fn(() => { throw error; }),
      setItem: vi.fn(() => { throw error; }),
      removeItem: vi.fn(() => { throw error; }),
    };
    const hint = restorationHintFromScope(scope("LOCATION_MANAGER"), sessionId)!;
    expect(readSelectedScopeRestorationHint(storage)).toEqual({ kind: "unavailable" });
    expect(writeSelectedScopeRestorationHint(hint, storage)).toBe(false);
    expect(removeSelectedScopeRestorationHint(storage)).toBe(false);
  });

  it("overwrites a still-readable hint with an invalid tombstone when remove alone throws", () => {
    const storage = memoryStorage();
    const hint = restorationHintFromScope(scope("LOCATION_MANAGER"), sessionId)!;
    expect(writeSelectedScopeRestorationHint(hint, storage)).toBe(true);
    storage.removeItem = () => {
      throw new Error("remove blocked");
    };
    expect(removeSelectedScopeRestorationHint(storage)).toBe(true);
    expect(readSelectedScopeRestorationHint(storage)).toEqual({ kind: "invalid" });
  });

  it("does not create a restorable hint without validated logical-session continuity", () => {
    expect(restorationHintFromScope(scope("LOCATION_MANAGER"), null)).toBeNull();
    expect(restorationHintFromScope(scope("LOCATION_MANAGER"), "not-a-uuid")).toBeNull();
  });
});
