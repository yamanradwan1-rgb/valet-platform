import { randomBytes, randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import argon2 from "argon2";

import { dashboardAuthorizedLocationsResponseSchema } from "@valet/contracts";

import {
  DashboardApiTestContext,
} from "./dashboard-api-test-context";

class LocationsApiTestContext extends DashboardApiTestContext {
  httpUrl(path: string): string {
    return `${this.baseUrl}${path}`;
  }
}

const context = new LocationsApiTestContext("locations");

beforeAll(() => context.setupApi(), 120_000);
beforeEach(() => context.clearAntiAbuse());
afterAll(() => context.teardownApi(), 60_000);

const ENDPOINT = "/v1/staff/dashboard/locations";
const STAFF_PASSWORD = "exact dashboard api password";

async function orderingOracle(ids: string[]): Promise<string[]> {
  const result = await context.adminPool.query<{ id: string }>(
    `SELECT id::text AS id FROM locations
     WHERE id = ANY($1::uuid[])
     ORDER BY name ASC, id ASC`,
    [ids],
  );
  return result.rows.map((row) => row.id);
}

async function credentialize(userId: string): Promise<void> {
  const passwordHash = await argon2.hash(STAFF_PASSWORD, {
    hashLength: 32,
    memoryCost: 65_536,
    parallelism: 4,
    salt: randomBytes(16),
    timeCost: 3,
    type: argon2.argon2id,
    version: 19,
  });
  await context.adminPool.query(
    `UPDATE users SET password_hash = $2, updated_at = transaction_timestamp()
     WHERE id = $1`,
    [userId, passwordHash],
  );
}

/**
 * Creates a credentialed LOCATION_MANAGER whose explicit access rows cover
 * the base fixture location PLUS every given extra location id.
 */
async function multiSiteManager(
  fixture: Awaited<ReturnType<typeof context.managerFixture>>,
  extraLocationIds: string[],
): Promise<string> {
  const actor = await context.createActor(fixture, "LOCATION_MANAGER");
  for (const locationId of extraLocationIds) {
    await context.grantAccess(fixture, actor.membershipId, locationId);
  }
  const emailRow = await context.adminPool.query<{ email: string }>(
    `SELECT email FROM users WHERE id = $1`,
    [actor.userId],
  );
  const email = emailRow.rows[0]!.email;
  await credentialize(actor.userId);
  const login = await context.login({
    email,
    membershipId: actor.membershipId,
    password: STAFF_PASSWORD,
    userId: actor.userId,
  });
  expect(login.status).toBe(200);
  return `Bearer ${String(login.body?.accessToken)}`;
}

describe("VAL-D2-005 authorized locations HTTP boundary", () => {
  it("requires staff authentication and never enumerates without it", async () => {
    const result = await context.request("GET", ENDPOINT);
    expect(result.status).toBe(401);
    expect(result.body?.locations).toBeUndefined();
  });

  it("rejects duplicated authorization headers", async () => {
    const fixture = await context.managerFixture();
    const { authorization } = await context.authenticated(fixture);
    const duplicated = await fetch(context.httpUrl(ENDPOINT), {
      headers: [
        ["authorization", authorization],
        ["authorization", authorization],
        ["x-request-id", randomUUID()],
      ],
    });
    expect(duplicated.status).toBe(401);
  });

  it("returns exactly the contract projection for an authorized manager", async () => {
    const fixture = await context.managerFixture();
    const { authorization } = await context.authenticated(fixture);
    const result = await context.request("GET", ENDPOINT, { authorization });
    expect(result.status).toBe(200);

    // Shared-contract validation passes AND the key set is exact.
    const parsed = dashboardAuthorizedLocationsResponseSchema.safeParse(
      result.body,
    );
    expect(parsed.success).toBe(true);
    const locations = (result.body?.locations ?? []) as Array<
      Record<string, unknown>
    >;
    expect(locations.length).toBeGreaterThanOrEqual(1);
    for (const entry of locations) {
      expect(Object.keys(entry).sort()).toEqual(
        ["currency", "locationId", "name", "organizationId", "timezone"].sort(),
      );
    }
    const own = locations.find(
      (entry) => entry.locationId === fixture.locationId,
    );
    expect(own).toMatchObject({
      currency: "JOD",
      name: "Shift location",
      organizationId: fixture.organizationId,
      timezone: "Asia/Amman",
    });
  });

  it("returns a successful EMPTY list without any authorized manager access", async () => {
    const fixture = await context.managerFixture();

    // Wrong role.
    const admin = await context.authenticated(fixture, "ORG_ADMIN");
    const adminResult = await context.request("GET", ENDPOINT, {
      authorization: admin.authorization,
    });
    expect(adminResult.status).toBe(200);
    expect(adminResult.body).toEqual({ locations: [] });

    // LOCATION_MANAGER membership WITHOUT an explicit membership_location_access row.
    const noAccess = await context.createActor(fixture, "LOCATION_MANAGER", {
      access: false,
    });
    const emailRow = await context.adminPool.query<{ email: string }>(
      `SELECT email FROM users WHERE id = $1`,
      [noAccess.userId],
    );
    await credentialize(noAccess.userId);
    const login = await context.login({
      email: emailRow.rows[0]!.email,
      membershipId: noAccess.membershipId,
      password: STAFF_PASSWORD,
      userId: noAccess.userId,
    });
    expect(login.status).toBe(200);
    const noAccessResult = await context.request("GET", ENDPOINT, {
      authorization: `Bearer ${String(login.body?.accessToken)}`,
    });
    expect(noAccessResult.status).toBe(200);
    expect(noAccessResult.body).toEqual({ locations: [] });
  });

  it("returns multiple authorized locations deterministically and isolates organizations", async () => {
    const fixture = await context.managerFixture();
    const zuluSite = await context.addLocation(fixture, { name: "Zulu Site" });
    const alphaSite = await context.addLocation(fixture, { name: "Alpha Site" });
    const otherOrg = await context.createFixture({
      role: "LOCATION_MANAGER",
    });
    await context.addLocation(otherOrg, { name: "AAA Foreign Site" });

    const authorization = await multiSiteManager(fixture, [
      alphaSite,
      zuluSite,
    ]);
    const first = await context.request("GET", ENDPOINT, { authorization });
    const second = await context.request("GET", ENDPOINT, { authorization });
    expect(first.status).toBe(200);
    // Deterministic across repeated calls.
    expect(second.body).toEqual(first.body);

    const locations = first.body?.locations as Array<{
      locationId: string;
      name: string;
      organizationId: string;
    }>;
    const ids = locations.map((entry) => entry.locationId);
    // Response order equals the backend name-then-id ordering for its own rows.
    expect(ids).toEqual(await orderingOracle(ids));
    expect(locations[0]!.name).toBe("Alpha Site");
    // No cross-organization leakage.
    expect(ids).not.toContain(otherOrg.locationId);
    for (const entry of locations) {
      expect(entry.organizationId).toBe(fixture.organizationId);
    }
  });
});
