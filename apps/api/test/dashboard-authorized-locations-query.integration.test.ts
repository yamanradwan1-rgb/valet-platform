import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DashboardTestContext } from "./dashboard-test-context";

/**
 * D2-005 — authorization matrix behind the public authorized-location
 * endpoint, verified against the SINGLE source of truth
 * (`listAuthorizedDashboardLocations`) at the database level:
 * every inactive/wrong-role/missing-access path stays excluded and the
 * returned projection/order is exactly what the API contract exposes.
 */
const context = new DashboardTestContext("locations");

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 120_000);

async function disableUser(userId: string): Promise<void> {
  await context.adminPool.query(
    `UPDATE users SET status = 'DISABLED', updated_at = transaction_timestamp()
     WHERE id = $1`,
    [userId],
  );
}

async function deactivateMembership(membershipId: string): Promise<void> {
  await context.adminPool.query(
    `UPDATE organization_memberships SET status = 'INACTIVE',
       updated_at = transaction_timestamp()
     WHERE id = $1`,
    [membershipId],
  );
}

/** Ordering oracle using the exact same ORDER BY as production SQL. */
async function expectedOrder(ids: string[]): Promise<string[]> {
  const result = await context.adminPool.query<{ id: string }>(
    `SELECT id::text AS id FROM locations
     WHERE id = ANY($1::uuid[])
     ORDER BY name ASC, id ASC`,
    [ids],
  );
  return result.rows.map((row) => row.id);
}

describe("VAL-D2-005 authorized dashboard locations query", () => {
  it("returns the authorized location with the exact public projection", async () => {
    const fixture = await context.createFixture({ role: "LOCATION_MANAGER" });
    const rows = await context.enumerate(fixture.userId);
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(Object.keys(row).sort()).toEqual(
      ["currency", "locationId", "name", "organizationId", "timezone"].sort(),
    );
    expect(row.locationId).toBe(fixture.locationId);
    expect(row.organizationId).toBe(fixture.organizationId);
    expect(row.currency).toBe("JOD");
    expect(row.timezone).toBe("Asia/Amman");
  });

  it("excludes inactive actors, wrong roles, inactive memberships, inactive organizations, inactive locations and missing access rows", async () => {
    const base = await context.createFixture({ role: "LOCATION_MANAGER" });
    const inactiveLocation = await context.addLocation(base, {
      status: "INACTIVE",
    });
    const inaccessibleLocation = await context.addLocation(base, {
      access: false,
    });
    const admin = await context.createActor(base, "ORG_ADMIN");
    const supervisor = await context.createActor(base, "VALET_SUPERVISOR");
    const dormantManager = await context.createActor(
      base,
      "LOCATION_MANAGER",
    );
    await deactivateMembership(dormantManager.membershipId);
    const disabledAccount = await context.createFixture({
      role: "LOCATION_MANAGER",
    });
    await disableUser(disabledAccount.userId);
    const deadOrganization = await context.createFixture({
      role: "LOCATION_MANAGER",
      organizationStatus: "INACTIVE",
    });

    const visible = await context.enumerate(base.userId);
    expect(visible.map((row) => row.locationId)).toEqual([base.locationId]);
    const visibleIds = new Set(visible.map((row) => row.locationId));
    expect(visibleIds.has(inactiveLocation)).toBe(false);
    expect(visibleIds.has(inaccessibleLocation)).toBe(false);

    for (const userId of [
      admin.userId,
      supervisor.userId,
      dormantManager.userId,
      disabledAccount.userId,
      deadOrganization.userId,
    ]) {
      expect(await context.enumerate(userId)).toEqual([]);
    }
  });

  it("orders multiple authorized locations deterministically by name then id", async () => {
    const fixture = await context.createFixture({ role: "LOCATION_MANAGER" });
    await context.addLocation(fixture, { name: "B Hotel" });
    await context.addLocation(fixture, { name: "A Hotel" });
    const tieOne = await context.addLocation(fixture, { name: "Same Name" });
    const tieTwo = await context.addLocation(fixture, { name: "Same Name" });

    const first = await context.enumerate(fixture.userId);
    const second = await context.enumerate(fixture.userId);
    // Deterministic across repeated calls.
    expect(second).toEqual(first);

    const allIds = [
      fixture.locationId,
      tieOne,
      tieTwo,
      ...first.map((row) => row.locationId),
    ];
    expect(first.map((row) => row.locationId)).toEqual(
      await expectedOrder([...new Set(allIds)]),
    );
    expect(first.map((row) => row.name)).toEqual([
      "A Hotel",
      "B Hotel",
      "Same Name",
      "Same Name",
      "Shift location",
    ]);
  });

  it("never leaks another organization's locations", async () => {
    const orgA = await context.createFixture({ role: "LOCATION_MANAGER" });
    const orgB = await context.createFixture({ role: "LOCATION_MANAGER" });
    await context.addLocation(orgA, { name: "A extra site" });
    await context.grantAccess(orgA, orgB.membershipId, orgB.locationId).catch(
      () => undefined,
    );

    const seenByA = await context.enumerate(orgA.userId);
    const seenByB = await context.enumerate(orgB.userId);
    expect(seenByA.every((row) => row.organizationId === orgA.organizationId))
      .toBe(true);
    expect(seenByA.some((row) => row.locationId === orgB.locationId)).toBe(
      false,
    );
    if (seenByB.length > 0) {
      expect(seenByB.every((row) => row.organizationId === orgB.organizationId))
        .toBe(true);
    }
    const idsA = new Set(seenByA.map((row) => row.locationId));
    for (const row of seenByB) {
      expect(idsA.has(row.locationId)).toBe(false);
    }
  });
});
