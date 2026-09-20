import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  DashboardApiTestContext,
  type DashboardStaffCredentials,
} from "./dashboard-api-test-context";

const context = new DashboardApiTestContext("scope_discovery");

beforeAll(() => context.setupApi(), 120_000);
beforeEach(() => context.clearAntiAbuse());
afterAll(() => context.teardownApi(), 60_000);

async function bearer(credentials: DashboardStaffCredentials): Promise<string> {
  const login = await context.login(credentials);
  expect(login.status).toBe(200);
  return `Bearer ${String(login.body?.accessToken)}`;
}

function organizations(query = ""): string {
  return `/v1/staff/dashboard/organizations${query}`;
}

function locations(organizationId: string, query = ""): string {
  return `/v1/staff/dashboard/organizations/${organizationId}/locations${query}`;
}

function itemIds(body: Record<string, unknown> | undefined, key: string): string[] {
  return ((body?.items ?? []) as Array<Record<string, unknown>>).map((item) =>
    String(item[key]),
  );
}

describe("MD-01 Location Manager scope discovery", () => {
  it("discovers only active LM organizations across mixed roles and preserves no-store", async () => {
    const lmOrg = await context.createFixture({ role: "VALET_EMPLOYEE" });
    const staff = await context.createStaff(lmOrg, "LOCATION_MANAGER");
    const secondLmOrg = await context.createFixture(
      { role: "LOCATION_MANAGER" },
      staff.userId,
    );
    const adminOnlyOrg = await context.createFixture(
      { role: "ORG_ADMIN" },
      staff.userId,
    );
    const token = await bearer(staff);

    const response = await context.request("GET", organizations(), {
      authorization: token,
    });
    expect(response.status).toBe(200);
    expect(new Set(itemIds(response.body, "organizationId"))).toEqual(
      new Set([lmOrg.organizationId, secondLmOrg.organizationId]),
    );
    expect(itemIds(response.body, "organizationId")).not.toContain(
      adminOnlyOrg.organizationId,
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("pragma")).toBe("no-cache");
  });

  it("returns granted active and inactive Locations but excludes ungranted and cross-tenant scope", async () => {
    const fixture = await context.createFixture({ role: "VALET_EMPLOYEE" });
    const staff = await context.createStaff(fixture, "LOCATION_MANAGER");
    const inactive = await context.addLocation(fixture, {
      access: false,
      name: "Historical Location",
      status: "INACTIVE",
    });
    await context.grantAccess(fixture, staff.membershipId, inactive);
    const ungranted = await context.addLocation(fixture, {
      access: false,
      name: "Hidden Location",
    });
    const foreign = await context.createFixture({ role: "LOCATION_MANAGER" });
    const token = await bearer(staff);

    const response = await context.request("GET", locations(fixture.organizationId), {
      authorization: token,
    });
    expect(response.status).toBe(200);
    const rows = (response.body?.items ?? []) as Array<Record<string, unknown>>;
    expect(new Set(rows.map((row) => row.locationId))).toEqual(
      new Set([fixture.locationId, inactive]),
    );
    expect(rows.find((row) => row.locationId === inactive)).toMatchObject({
      currency: "JOD",
      name: "Historical Location",
      status: "INACTIVE",
      timezone: "Asia/Amman",
    });
    expect(itemIds(response.body, "locationId")).not.toContain(ungranted);
    expect(itemIds(response.body, "locationId")).not.toContain(foreign.locationId);
    expect(
      (
        await context.request("GET", locations(foreign.organizationId), {
          authorization: token,
        })
      ).status,
    ).toBe(404);
  });

  it("uses bounded signed cursors scoped to user, kind, and organization", async () => {
    const firstOrg = await context.createFixture({ role: "VALET_EMPLOYEE" });
    const first = await context.createStaff(firstOrg, "LOCATION_MANAGER");
    const secondOrg = await context.createFixture(
      { role: "LOCATION_MANAGER" },
      first.userId,
    );
    const other = await context.createStaff(firstOrg, "LOCATION_MANAGER");
    const token = await bearer(first);
    const otherToken = await bearer(other);
    const extraLocation = await context.addLocation(firstOrg, { access: false });
    await context.grantAccess(firstOrg, first.membershipId, extraLocation);

    const orgPage = await context.request("GET", organizations("?limit=1"), {
      authorization: token,
    });
    const orgCursor = String(orgPage.body?.nextCursor);
    expect(orgPage.status).toBe(200);
    expect(orgCursor).not.toBe("null");
    expect(
      (
        await context.request("GET", organizations(`?limit=1&cursor=${orgCursor}`), {
          authorization: otherToken,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await context.request("GET", locations(firstOrg.organizationId, `?cursor=${orgCursor}`), {
          authorization: token,
        })
      ).status,
    ).toBe(400);

    const locationPage = await context.request(
      "GET",
      locations(firstOrg.organizationId, "?limit=1"),
      { authorization: token },
    );
    const locationCursor = String(locationPage.body?.nextCursor);
    expect(locationCursor).not.toBe("null");
    expect(
      (
        await context.request(
          "GET",
          locations(secondOrg.organizationId, `?cursor=${locationCursor}`),
          { authorization: token },
        )
      ).status,
    ).toBe(400);
    const tampered = `${locationCursor.slice(0, -1)}${
      locationCursor.endsWith("A") ? "B" : "A"
    }`;
    expect(
      (
        await context.request(
          "GET",
          locations(firstOrg.organizationId, `?cursor=${tampered}`),
          { authorization: token },
        )
      ).status,
    ).toBe(400);
  });

  it("rechecks grants, membership role/status, organization, and user on later pages", async () => {
    const fixture = await context.createFixture({ role: "VALET_EMPLOYEE" });
    const staff = await context.createStaff(fixture, "LOCATION_MANAGER");
    const second = await context.addLocation(fixture, { access: false });
    const third = await context.addLocation(fixture, { access: false });
    await context.grantAccess(fixture, staff.membershipId, second);
    await context.grantAccess(fixture, staff.membershipId, third);
    const token = await bearer(staff);
    const page = await context.request(
      "GET",
      locations(fixture.organizationId, "?limit=1"),
      { authorization: token },
    );
    const firstId = itemIds(page.body, "locationId")[0]!;
    const cursor = String(page.body?.nextCursor);
    await context.adminPool.query(
      `DELETE FROM membership_location_access
       WHERE membership_id = $1 AND location_id > $2::uuid`,
      [staff.membershipId, firstId],
    );
    const afterGrantRevocation = await context.request(
      "GET",
      locations(fixture.organizationId, `?limit=1&cursor=${cursor}`),
      { authorization: token },
    );
    expect(afterGrantRevocation.status).toBe(200);
    expect(afterGrantRevocation.body?.items).toEqual([]);

    for (const statement of [
      "UPDATE organization_memberships SET status = 'INACTIVE' WHERE id = $1",
      "UPDATE organization_memberships SET role = 'VALET_SUPERVISOR', status = 'ACTIVE' WHERE id = $1",
      "UPDATE organizations SET status = 'INACTIVE' WHERE id = $1",
    ]) {
      await context.adminPool.query(
        "UPDATE organization_memberships SET role = 'LOCATION_MANAGER', status = 'ACTIVE' WHERE id = $1",
        [staff.membershipId],
      );
      await context.adminPool.query(
        "UPDATE organizations SET status = 'ACTIVE' WHERE id = $1",
        [fixture.organizationId],
      );
      const target = statement.startsWith("UPDATE organizations")
        ? fixture.organizationId
        : staff.membershipId;
      await context.adminPool.query(statement, [target]);
      expect(
        (
          await context.request("GET", locations(fixture.organizationId), {
            authorization: token,
          })
        ).status,
      ).toBe(404);
    }
    await context.adminPool.query("UPDATE users SET status = 'DISABLED' WHERE id = $1", [
      staff.userId,
    ]);
    expect(
      (
        await context.request("GET", organizations(), { authorization: token })
      ).status,
    ).toBe(401);
  });

  it("keeps discovery and subscription recovery available when Dashboard access is disabled", async () => {
    const fixture = await context.createFixture({ role: "VALET_EMPLOYEE" });
    const staff = await context.createStaff(fixture, "LOCATION_MANAGER");
    const token = await bearer(staff);
    await context.adminPool.query(
      `UPDATE organization_subscriptions
       SET dashboard_access_enabled = FALSE
       WHERE organization_id = $1`,
      [fixture.organizationId],
    );

    expect(
      (
        await context.request("GET", organizations(), { authorization: token })
      ).status,
    ).toBe(200);
    expect(
      (
        await context.request("GET", locations(fixture.organizationId), {
          authorization: token,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await context.request(
          "GET",
          `/v1/staff/dashboard/locations/${fixture.locationId}/subscription`,
          { authorization: token },
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await context.request(
          "GET",
          `/v1/staff/dashboard/locations/${fixture.locationId}/branding`,
          { authorization: token },
        )
      ).status,
    ).toBe(404);
  });

  it("rejects unauthenticated and out-of-contract list inputs", async () => {
    expect((await context.request("GET", organizations())).status).toBe(401);
    const fixture = await context.createFixture({ role: "VALET_EMPLOYEE" });
    const staff = await context.createStaff(fixture, "LOCATION_MANAGER");
    const token = await bearer(staff);
    for (const query of ["?limit=0", "?limit=101", "?offset=1", `?cursor=${"A".repeat(513)}`]) {
      expect(
        (
          await context.request("GET", organizations(query), {
            authorization: token,
          })
        ).status,
      ).toBe(400);
    }
    expect(
      (
        await context.request("GET", locations(randomUUID()), {
          authorization: token,
        })
      ).status,
    ).toBe(404);
  });
});
