import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { ManagementControlPlaneTestFixture } from "./management-control-plane-test-fixture";

const fixture = new ManagementControlPlaneTestFixture();

beforeAll(() => fixture.start(), 120_000);
afterEach(() => fixture.resetLimits());
afterAll(() => fixture.stop(), 60_000);

function organizationsPath(limit = 25, cursor?: string): string {
  const query = new URLSearchParams({ limit: String(limit) });
  if (cursor !== undefined) query.set("cursor", cursor);
  return `/v1/staff/management/organizations?${query.toString()}`;
}

function locationsPath(
  organizationId: string,
  limit = 25,
  cursor?: string,
): string {
  const query = new URLSearchParams({ limit: String(limit) });
  if (cursor !== undefined) query.set("cursor", cursor);
  return `/v1/staff/management/organizations/${organizationId}/locations?${query.toString()}`;
}

function contextPath(
  organizationId: string,
  scope: "ALL_LOCATIONS" | { readonly locationId: string },
): string {
  const query =
    scope === "ALL_LOCATIONS"
      ? "scopeKind=ALL_LOCATIONS"
      : new URLSearchParams({
          locationId: scope.locationId,
          scopeKind: "LOCATION",
        }).toString();
  return `/v1/staff/management/organizations/${organizationId}/context?${query}`;
}

describe("MGT-BE-03 Company Admin control plane", () => {
  it("requires MFA assurance on the exact Staff session", async () => {
    const user = await fixture.createUser();
    await fixture.createMembership(user.id, { name: "Exact session org" });
    const first = await fixture.nativeLogin(user);
    const second = await fixture.nativeLogin(user);
    const factor = await fixture.enrollAndAssure(first);

    const firstAllowed = await fixture.managementGet(
      organizationsPath(),
      first.accessToken,
    );
    expect(firstAllowed.status).toBe(200);

    const secondDenied = await fixture.managementGet(
      organizationsPath(),
      second.accessToken,
    );
    expect(secondDenied.status).toBe(403);
    expect(secondDenied.body).toMatchObject({ code: "MFA_STEP_UP_REQUIRED" });

    const steppedUp = await fixture.stepUp(second, factor.secret);
    expect(steppedUp.status).toBe(200);
    const secondAllowed = await fixture.managementGet(
      organizationsPath(),
      second.accessToken,
    );
    expect(secondAllowed.status).toBe(200);
  });

  it("lists ACTIVE and INACTIVE Locations and represents both scopes explicitly", async () => {
    const user = await fixture.createUser();
    const membership = await fixture.createMembership(user.id, {
      name: "Selector org",
    });
    const inactive = await fixture.addLocation(membership.organizationId, {
      name: "B Inactive",
      status: "INACTIVE",
    });
    const active = await fixture.addLocation(membership.organizationId, {
      name: "A Active",
    });
    const auth = await fixture.nativeLogin(user);
    await fixture.enrollAndAssure(auth);

    const locations = await fixture.managementGet(
      locationsPath(membership.organizationId),
      auth.accessToken,
    );
    expect(locations.status).toBe(200);
    expect(locations.body?.items).toEqual([
      expect.objectContaining({
        locationId: active.locationId,
        name: active.name,
        status: "ACTIVE",
      }),
      expect.objectContaining({
        locationId: inactive.locationId,
        name: inactive.name,
        status: "INACTIVE",
      }),
    ]);

    const selected = await fixture.managementGet(
      contextPath(membership.organizationId, {
        locationId: inactive.locationId,
      }),
      auth.accessToken,
    );
    expect(selected.status).toBe(200);
    expect(selected.body).toMatchObject({
      scope: { kind: "LOCATION", locationId: inactive.locationId },
      selectedLocation: {
        locationId: inactive.locationId,
        status: "INACTIVE",
      },
    });

    const all = await fixture.managementGet(
      contextPath(membership.organizationId, "ALL_LOCATIONS"),
      auth.accessToken,
    );
    expect(all.status).toBe(200);
    expect(all.body).toMatchObject({
      scope: { kind: "ALL_LOCATIONS" },
      selectedLocation: null,
    });
    expect(all.body?.capabilities).toContain("ALL_LOCATIONS_SCOPE_SELECT");
  });

  it("isolates an ORG_ADMIN Organization from a second LOCATION_MANAGER Organization", async () => {
    const user = await fixture.createUser();
    const admin = await fixture.createMembership(user.id, { name: "A Admin" });
    const manager = await fixture.createMembership(user.id, {
      name: "B Manager",
      role: "LOCATION_MANAGER",
    });
    await fixture.addLocation(admin.organizationId, { name: "Admin only" });
    await fixture.addLocation(manager.organizationId, { name: "Manager only" });
    const auth = await fixture.nativeLogin(user);
    await fixture.enrollAndAssure(auth);

    const organizations = await fixture.managementGet(
      organizationsPath(),
      auth.accessToken,
    );
    expect(organizations.status).toBe(200);
    expect(organizations.body?.items).toEqual([
      expect.objectContaining({ organizationId: admin.organizationId }),
    ]);

    const adminContext = await fixture.managementGet(
      contextPath(admin.organizationId, "ALL_LOCATIONS"),
      auth.accessToken,
    );
    expect(adminContext.status).toBe(200);
    const managerContext = await fixture.managementGet(
      contextPath(manager.organizationId, "ALL_LOCATIONS"),
      auth.accessToken,
    );
    expect(managerContext.status).toBe(404);
    expect(managerContext.body).toMatchObject({ code: "AUTHORIZATION_DENIED" });

    const managerLocations = await fixture.managementGet(
      locationsPath(manager.organizationId),
      auth.accessToken,
    );
    expect(managerLocations.status).toBe(404);
    expect(managerLocations.body).toMatchObject({
      code: "AUTHORIZATION_DENIED",
    });
  });

  it("keeps two Company Admin Organizations and their Location pages isolated", async () => {
    const user = await fixture.createUser();
    const first = await fixture.createMembership(user.id, {
      name: "A Company",
    });
    const second = await fixture.createMembership(user.id, {
      name: "B Company",
    });
    const firstLocation = await fixture.addLocation(first.organizationId, {
      name: "A Location",
    });
    const secondLocation = await fixture.addLocation(second.organizationId, {
      name: "B Location",
    });
    const auth = await fixture.nativeLogin(user);
    await fixture.enrollAndAssure(auth);

    const firstPage = await fixture.managementGet(
      organizationsPath(1),
      auth.accessToken,
    );
    expect(firstPage.status).toBe(200);
    expect(firstPage.body?.items).toEqual([
      expect.objectContaining({ organizationId: first.organizationId }),
    ]);
    const cursor = String(firstPage.body?.nextCursor);
    const secondPage = await fixture.managementGet(
      organizationsPath(1, cursor),
      auth.accessToken,
    );
    expect(secondPage.status).toBe(200);
    expect(secondPage.body?.items).toEqual([
      expect.objectContaining({ organizationId: second.organizationId }),
    ]);

    const firstLocations = await fixture.managementGet(
      locationsPath(first.organizationId),
      auth.accessToken,
    );
    const secondLocations = await fixture.managementGet(
      locationsPath(second.organizationId),
      auth.accessToken,
    );
    expect(firstLocations.body?.items).toEqual([
      expect.objectContaining({ locationId: firstLocation.locationId }),
    ]);
    expect(secondLocations.body?.items).toEqual([
      expect.objectContaining({ locationId: secondLocation.locationId }),
    ]);
  });

  it("rejects Location cursor crossover and malformed cursor tampering", async () => {
    const user = await fixture.createUser();
    const first = await fixture.createMembership(user.id, { name: "Cursor A" });
    const second = await fixture.createMembership(user.id, {
      name: "Cursor B",
    });
    await fixture.addLocation(first.organizationId, { name: "A First" });
    await fixture.addLocation(first.organizationId, { name: "B Second" });
    await fixture.addLocation(second.organizationId, { name: "Other" });
    const auth = await fixture.nativeLogin(user);
    await fixture.enrollAndAssure(auth);

    const page = await fixture.managementGet(
      locationsPath(first.organizationId, 1),
      auth.accessToken,
    );
    expect(page.status).toBe(200);
    const cursor = String(page.body?.nextCursor);
    expect(cursor).not.toBe("null");

    const crossed = await fixture.managementGet(
      locationsPath(second.organizationId, 1, cursor),
      auth.accessToken,
    );
    expect(crossed.status).toBe(400);
    expect(crossed.body).toMatchObject({ code: "REQUEST_INVALID" });

    const tampered = await fixture.managementGet(
      locationsPath(first.organizationId, 1, `${cursor}!`),
      auth.accessToken,
    );
    expect(tampered.status).toBe(400);
    expect(tampered.body).toMatchObject({ code: "REQUEST_INVALID" });
  });

  it.each(["LOCATION_MANAGER", "VALET_SUPERVISOR", "VALET_EMPLOYEE"] as const)(
    "denies %s Company Management context with bounded scope semantics",
    async (role) => {
      const user = await fixture.createUser();
      const membership = await fixture.createMembership(user.id, { role });
      const auth = await fixture.nativeLogin(user);

      const result = await fixture.managementGet(
        contextPath(membership.organizationId, "ALL_LOCATIONS"),
        auth.accessToken,
      );
      expect(result.status).toBe(404);
      expect(result.body).toMatchObject({ code: "AUTHORIZATION_DENIED" });
    },
  );
});
