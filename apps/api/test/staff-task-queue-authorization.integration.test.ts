import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createStaffTaskQueueHarness } from "./staff-task-queue-harness";

const harness = createStaffTaskQueueHarness();

beforeAll(async () => {
  await harness.start();
}, 120_000);

beforeEach(() => harness.resetPrincipals());

afterAll(async () => {
  await harness.close();
}, 60_000);

describe("VUI-003A2 staff task queue authorization & boundaries", () => {
  it("enforces strict authentication on missing, invalid, and duplicate credentials", async () => {
    const actor = await harness.fixtureWithToken("VALET_EMPLOYEE");

    // 1. Missing Authorization header
    const noAuth = await harness.request(
      "GET",
      `/v1/staff/tasks/queue?locationId=${actor.fixture.locationId}`,
    );
    expect(noAuth.status).toBe(401);

    // 2. Invalid bearer token
    const invalidToken = await harness.request(
      "GET",
      `/v1/staff/tasks/queue?locationId=${actor.fixture.locationId}`,
      { token: "invalid-token-value" },
    );
    expect(invalidToken.status).toBe(401);

    // 3. Duplicate Authorization header rejected
    const duplicateAuth = await harness.rawDuplicateAuthRequest(
      actor.fixture.locationId,
      actor.token,
    );
    expect(duplicateAuth.status).toBeGreaterThanOrEqual(400);
    expect(duplicateAuth.status).toBeLessThan(500);
  });

  it("denies access when staff member lacks active shift at target location", async () => {
    const actor = await harness.fixtureWithToken("VALET_EMPLOYEE");

    // Member with access but no active shift
    const noShift = await harness.context.addMember(
      actor.fixture,
      "VALET_EMPLOYEE",
      false,
    );
    const noShiftToken = `no-shift-${randomUUID()}`;
    harness.principals.set(`Bearer ${noShiftToken}`, noShift.userId);
    const noShiftRes = await harness.request(
      "GET",
      `/v1/staff/tasks/queue?locationId=${actor.fixture.locationId}`,
      { token: noShiftToken },
    );
    expect(noShiftRes.status).toBe(404);
  });

  it("denies non-operational roles (ORG_ADMIN and LOCATION_MANAGER)", async () => {
    const actor = await harness.fixtureWithToken("VALET_SUPERVISOR");

    // ORG_ADMIN denied
    const orgAdmin = await harness.context.addMember(
      actor.fixture,
      "ORG_ADMIN",
      false,
    );
    const adminToken = `admin-${randomUUID()}`;
    harness.principals.set(`Bearer ${adminToken}`, orgAdmin.userId);
    const adminRes = await harness.request(
      "GET",
      `/v1/staff/tasks/queue?locationId=${actor.fixture.locationId}`,
      { token: adminToken },
    );
    expect(adminRes.status).toBe(404);

    // LOCATION_MANAGER denied
    const locManager = await harness.context.addMember(
      actor.fixture,
      "LOCATION_MANAGER",
      false,
    );
    const managerToken = `manager-${randomUUID()}`;
    harness.principals.set(`Bearer ${managerToken}`, locManager.userId);
    const managerRes = await harness.request(
      "GET",
      `/v1/staff/tasks/queue?locationId=${actor.fixture.locationId}`,
      { token: managerToken },
    );
    expect(managerRes.status).toBe(404);
  });

  it("denies same-tenant unauthorized location and cross-tenant location", async () => {
    const actor = await harness.fixtureWithToken("VALET_EMPLOYEE");

    // Same-tenant second location where employee has NO active shift / access
    const sameOrgOtherLocationId = await harness.createSameOrgLocation(
      actor.fixture,
    );
    const sameTenantUnauthorized = await harness.request(
      "GET",
      `/v1/staff/tasks/queue?locationId=${sameOrgOtherLocationId}`,
      { token: actor.token },
    );
    expect(sameTenantUnauthorized.status).toBe(404);

    // Cross-tenant location
    const otherTenant = await harness.context.createDispatchFixture();
    const crossTenant = await harness.request(
      "GET",
      `/v1/staff/tasks/queue?locationId=${otherTenant.locationId}`,
      { token: actor.token },
    );
    expect(crossTenant.status).toBe(404);
  });
});
