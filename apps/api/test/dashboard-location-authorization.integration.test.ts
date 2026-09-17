import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DashboardTestContext } from "./dashboard-test-context";

const context = new DashboardTestContext("authorization");

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 120_000);

describe("VAL-009A exact-location dashboard authorization", () => {
  it("authorizes an exact-location manager without any Shift", async () => {
    const fixture = await context.createFixture({ role: "LOCATION_MANAGER" });
    const scope = await context.authorize({
      authenticatedUserId: fixture.userId,
      locationId: fixture.locationId,
    });
    expect(scope).toEqual({
      locationId: fixture.locationId,
      membershipId: fixture.membershipId,
      organizationId: fixture.organizationId,
    });
  });

  it("does not let access to one Location authorize another", async () => {
    const fixture = await context.createFixture({ role: "LOCATION_MANAGER" });
    const otherLocation = await context.addLocation(fixture, {
      access: false,
    });
    const granted = await context.authorize({
      authenticatedUserId: fixture.userId,
      locationId: fixture.locationId,
    });
    expect(granted).not.toBeNull();
    const ungranted = await context.authorize({
      authenticatedUserId: fixture.userId,
      locationId: otherLocation,
    });
    expect(ungranted).toBeNull();
  });

  it.each([
    ["user", "UPDATE users SET status = 'DISABLED' WHERE id = $1"],
    [
      "membership",
      "UPDATE organization_memberships SET status = 'INACTIVE' WHERE id = $1",
    ],
    ["organization", "UPDATE organizations SET status = 'INACTIVE' WHERE id = $1"],
    [
      "location",
      "UPDATE locations SET status = 'INACTIVE', accepting_intake = FALSE WHERE id = $1",
    ],
  ] as const)(
    "denies an inactive %s through the same denied outcome",
    async (authority, statement) => {
      const fixture = await context.createFixture({
        role: "LOCATION_MANAGER",
      });
      const target =
        authority === "membership"
          ? fixture.membershipId
          : authority === "organization"
            ? fixture.organizationId
            : authority === "location"
              ? fixture.locationId
              : fixture.userId;
      await context.adminPool.query(statement, [target]);
      const result = await context.authorize({
        authenticatedUserId: fixture.userId,
        locationId: fixture.locationId,
      });
      expect(result).toBeNull();
    },
  );

  it("denies every non-manager role uniformly, including a shifted supervisor", async () => {
    const fixture = await context.createFixture({ role: "LOCATION_MANAGER" });
    const admin = await context.createActor(fixture, "ORG_ADMIN");
    const supervisor = await context.createActor(fixture, "VALET_SUPERVISOR");
    const employee = await context.createActor(fixture, "VALET_EMPLOYEE");
    await context.startActiveShift(fixture, supervisor);
    for (const actor of [admin, supervisor, employee]) {
      const result = await context.authorize({
        authenticatedUserId: actor.userId,
        locationId: fixture.locationId,
      });
      expect(result).toBeNull();
    }
  });

  it("produces one identical denied boundary outcome for every failure class", async () => {
    const fixture = await context.createFixture({ role: "LOCATION_MANAGER" });
    const otherTenant = await context.createFixture({
      role: "LOCATION_MANAGER",
    });
    const sameOrgNoAccess = await context.addLocation(fixture, {
      access: false,
    });
    const inactiveLocation = await context.addLocation(fixture, {
      status: "INACTIVE",
    });
    const outcomes = [];
    for (const locationId of [
      randomUUID(),
      otherTenant.locationId,
      sameOrgNoAccess,
      inactiveLocation,
    ]) {
      outcomes.push(
        await context.authorize({
          authenticatedUserId: fixture.userId,
          locationId,
        }),
      );
    }
    outcomes.push(await context.authorize({ authenticatedUserId: randomUUID() }));
    expect(outcomes.every((outcome) => outcome === null)).toBe(true);
    expect(new Set(outcomes)).toEqual(new Set([null]));
  });
});

describe("VAL-009A authorized dashboard Location enumeration", () => {
  it("enumerates only explicitly granted ACTIVE Locations in deterministic order", async () => {
    const fixture = await context.createFixture({ role: "LOCATION_MANAGER" });
    const second = await context.addLocation(fixture, { name: "A Second" });
    await context.addLocation(fixture, { access: false, name: "C Hidden" });
    const firstPass = await context.enumerate(fixture.userId);
    expect(firstPass).toEqual([
      { locationId: second, name: "A Second", organizationId: fixture.organizationId },
      {
        locationId: fixture.locationId,
        name: "Shift location",
        organizationId: fixture.organizationId,
      },
    ]);
    const secondPass = await context.enumerate(fixture.userId);
    expect(secondPass).toEqual(firstPass);
  });

  it("excludes an inactive granted Location from enumeration", async () => {
    const fixture = await context.createFixture({ role: "LOCATION_MANAGER" });
    await context.addLocation(fixture, {
      name: "A Closed",
      status: "INACTIVE",
    });
    const result = await context.enumerate(fixture.userId);
    expect(result.map((location) => location.name)).toEqual([
      "Shift location",
    ]);
  });

  it("stops enumerating once the manager membership becomes inactive", async () => {
    const fixture = await context.createFixture({ role: "LOCATION_MANAGER" });
    await context.adminPool.query(
      `UPDATE organization_memberships SET status = 'INACTIVE'
       WHERE id = $1`,
      [fixture.membershipId],
    );
    expect(await context.enumerate(fixture.userId)).toEqual([]);
  });

  it("enumerates nothing for non-manager roles with the same access rows", async () => {
    const fixture = await context.createFixture({ role: "ORG_ADMIN" });
    const supervisor = await context.createActor(fixture, "VALET_SUPERVISOR");
    const employee = await context.createActor(fixture, "VALET_EMPLOYEE");
    for (const userId of [fixture.userId, supervisor.userId, employee.userId]) {
      expect(await context.enumerate(userId)).toEqual([]);
    }
  });
});
