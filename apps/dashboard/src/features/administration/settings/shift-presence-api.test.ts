import { describe, expect, it, vi } from "vitest";
import { DashboardApiClient } from "../../../lib/api/dashboard-api-client";
import { PresenceApi, presenceBase } from "./shift-presence-api";
import { presenceOutcomeUnknown } from "./shift-presence-errors";
import {
  attendanceZone,
  companyPolicy,
  locationPolicy,
  ZONE_ID,
} from "../../../../e2e/support/presence-data";

const org = locationPolicy().organizationId;
const loc = locationPolicy().locationId;
const mutationId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
function setup(
  body: unknown,
  authority: "COMPANY_ADMIN" | "LOCATION_MANAGER" = "LOCATION_MANAGER",
  company = false,
) {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockImplementation(
      async () => new Response(JSON.stringify(body), { status: 200 }),
    );
  const auth = {
    getAccessToken: () => "fixture",
    getIdentityGeneration: () => 1,
    getSessionGeneration: () => 1,
    isTokenFresh: () => true,
    refresh: vi.fn(),
  };
  const client = new DashboardApiClient({ auth, fetch: fetcher });
  const api = new PresenceApi(
    client,
    { authority, organizationId: org, locationId: company ? null : loc },
    () => ({}),
  );
  return { api, fetcher, auth, client };
}
describe("Presence exact public routes and receipts", () => {
  it.each(["create", "update", "set", "clear", "review"] as const)(
    "invalid %s input is a definite pre-dispatch failure without UNKNOWN",
    (operation) => {
      const { api, fetcher } = setup(locationPolicy());
      let error: unknown;
      try {
        if (operation === "create" || operation === "update")
          api.saveZone(ZONE_ID, {}, operation === "create");
        else if (operation === "set") api.setPolicy({});
        else if (operation === "clear") api.clearPolicy({});
        else api.review(ZONE_ID, "approve", {});
      } catch (failure) {
        error = failure;
      }
      expect(error).toMatchObject({ kind: "validation" });
      expect(presenceOutcomeUnknown(error)).toBe(false);
      expect(fetcher).not.toHaveBeenCalled();
    },
  );
  it("requires exact Location for LM and uses separate route authority", () => {
    expect(() =>
      presenceBase({
        authority: "LOCATION_MANAGER",
        organizationId: org,
        locationId: null,
      }),
    ).toThrow();
    expect(
      presenceBase({
        authority: "LOCATION_MANAGER",
        organizationId: org,
        locationId: loc,
      }),
    ).toBe(`/v1/staff/dashboard/locations/${loc}/configuration/shift-presence`);
    expect(
      presenceBase({
        authority: "COMPANY_ADMIN",
        organizationId: org,
        locationId: loc,
      }),
    ).toBe(
      `/v1/staff/management/organizations/${org}/shift-presence/locations/${loc}`,
    );
  });
  it("retains literal Company OFF, positive CAS and no caller scope in payload", async () => {
    const { api, fetcher } = setup(companyPolicy(), "COMPANY_ADMIN", true);
    await api.setPolicy({
      mutationId,
      expectedRevision: 1,
      field: "shiftStartPresenceMode",
      value: "OFF",
    });
    const [path, options] = fetcher.mock.calls[0]!;
    expect(path).toBe(
      `/v1/staff/management/organizations/${org}/shift-presence/policy/default`,
    );
    expect(options?.method).toBe("PUT");
    expect(JSON.parse(String(options?.body))).toEqual({
      mutationId,
      expectedRevision: 1,
      field: "shiftStartPresenceMode",
      value: "OFF",
    });
  });
  it("Clear is a distinct POST with paired revisions/fingerprint and no null value", async () => {
    const { api, fetcher } = setup(locationPolicy());
    const input = {
      mutationId,
      expectedRevision: 2,
      expectedCompanyRevision: 3,
      configurationFingerprint: "a".repeat(64),
      field: "shiftEndPresenceMode",
    };
    await api.clearPolicy(input);
    const [path, options] = fetcher.mock.calls[0]!;
    expect(path).toContain("/policy/override/clear");
    expect(options?.method).toBe("POST");
    expect(JSON.parse(String(options?.body))).toEqual(input);
  });
  it("bounds paging and preserves exact history filter/cursor", async () => {
    const { api, fetcher } = setup({ items: [], nextCursor: null });
    await api.zones(ZONE_ID);
    await api.exceptions("HISTORY", mutationId);
    const zoneQuery = new URL(
      String(fetcher.mock.calls[0]![0]),
      "https://fixture",
    ).searchParams;
    const exceptionQuery = new URL(
      String(fetcher.mock.calls[1]![0]),
      "https://fixture",
    ).searchParams;
    expect(zoneQuery.get("limit")).toBe("25");
    expect(zoneQuery.get("cursor")).toBe(ZONE_ID);
    expect(exceptionQuery.get("view")).toBe("HISTORY");
  });
  const unknown = {
    mutationId,
    attribution: "UNKNOWN",
    effect: null,
    entityId: null,
    revision: null,
    canonical: {
      kind: "ZONE",
      value: { zone: attendanceZone(), readiness: locationPolicy().readiness },
    },
  };
  it("equal current zone does not become COMMITTED; recovery is exact read only", async () => {
    const { api, fetcher } = setup(unknown);
    expect(
      (await api.result(mutationId, { kind: "ZONE", entityId: ZONE_ID }))
        .attribution,
    ).toBe("UNKNOWN");
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [path, options] = fetcher.mock.calls[0]!;
    const url = new URL(String(path), "https://fixture");
    expect(url.pathname.endsWith(`/results/${mutationId}`)).toBe(true);
    expect(url.searchParams.get("kind")).toBe("ZONE");
    expect(url.searchParams.get("entityId")).toBe(ZONE_ID);
    expect(options?.method).toBe("GET");
  });
  it.each(["mutation", "scope", "target", "kind", "attribution"])(
    "rejects wrong %s receipt without success",
    async (wrong) => {
      const body = structuredClone(unknown);
      if (wrong === "mutation") body.mutationId = loc;
      if (wrong === "scope")
        Object.assign(body.canonical.value.zone, { locationId: org });
      if (wrong === "target") body.canonical.value.zone.id = loc;
      if (wrong === "kind")
        Object.assign(body.canonical, {
          kind: "POLICY",
          value: locationPolicy(),
        });
      if (wrong === "attribution")
        Object.assign(body, { attribution: "COMMITTED" });
      const { api } = setup(body);
      await expect(
        api.result(mutationId, { kind: "ZONE", entityId: ZONE_ID }),
      ).rejects.toMatchObject({ kind: "malformed" });
    },
  );
  it("unbound or retired scopes reject before protected dispatch", async () => {
    const { client, fetcher } = setup(companyPolicy());
    const api = new PresenceApi(client, {
      authority: "COMPANY_ADMIN",
      organizationId: org,
      locationId: null,
    });
    expect(() =>
      api.setPolicy({
        mutationId,
        expectedRevision: 1,
        field: "shiftStartPresenceMode",
        value: "OFF",
      }),
    ).toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("preflight refresh guard can retire captured intent before POST/PUT", async () => {
    const { client, fetcher, auth } = setup(companyPolicy());
    auth.isTokenFresh = () => false;
    auth.refresh.mockResolvedValue({});
    const api = new PresenceApi(
      client,
      { authority: "COMPANY_ADMIN", organizationId: org, locationId: null },
      () => ({
        onAuthReconciled: () => {
          throw new Error("retired scope");
        },
      }),
    );
    await expect(
      api.setPolicy({
        mutationId,
        expectedRevision: 1,
        field: "shiftStartPresenceMode",
        value: "OFF",
      }),
    ).rejects.toThrow("retired scope");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
