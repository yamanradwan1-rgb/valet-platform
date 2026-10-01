import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, afterEach, describe, expect, it } from "vitest";
import { type StaffDirectoryItem } from "@valet/contracts";
import { seedStaffDirectoryFilters } from "./staff-directory-filter-fixture";
import { ManagementControlPlaneTestFixture } from "./management-control-plane-test-fixture";

const fixture = new ManagementControlPlaneTestFixture();
let token: string;
let organizationId: string;
let actorUserId: string;
let actorMembershipId: string;
let targetId: string;
let locationId: string;
let otherLocationId: string;
let foreignLocationId: string;
let foreignOrganizationId: string;

const path = (filters: Record<string, string> = {}, org = organizationId) =>
  `/v1/staff/management/organizations/${org}/staff?${new URLSearchParams(filters)}`;
async function page(filters: Record<string, string> = {}) {
  const result = await fixture.managementGet(path(filters), token);
  expect(result.status).toBe(200);
  expect(result.headers.get("cache-control")).toContain("no-store");
  return result.body as unknown as {
    items: StaffDirectoryItem[];
    nextCursor: string | null;
  };
}

beforeAll(async () => {
  await fixture.start();
  ({
    token,
    organizationId,
    actorUserId,
    actorMembershipId,
    targetId,
    locationId,
    otherLocationId,
    foreignLocationId,
    foreignOrganizationId,
  } = await seedStaffDirectoryFilters(fixture));
}, 120_000);
afterEach(() => fixture.resetLimits());
afterAll(() => fixture.stop(), 60_000);

describe("T05-A real server directory filters", () => {
  it("projects membership names and global email in list/detail, including legacy rows", async () => {
    const legacy = (await page()).items;
    expect(
      legacy.every(
        (item) =>
          item.identity.firstName === null && item.identity.lastName === null,
      ),
    ).toBe(true);
    const found = (await page({ search: "Needle" })).items;
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      membershipId: targetId,
      locationAccessCount: 1,
      identity: {
        firstName: "مُحَمَّد Needle",
        lastName: "O’Connor_%",
        email: "needle_email@example.com",
      },
    });
    const detail = await fixture.managementGet(
      `${path().split("?")[0]}/${targetId}`,
      token,
    );
    expect(detail.status).toBe(200);
    expect(detail.body?.identity).toEqual(found[0]?.identity);
    await fixture.addMembership(
      foreignOrganizationId,
      actorUserId,
      "ORG_ADMIN",
    );
    const other = await fixture.managementGet(
      path({ search: "needle_email" }, foreignOrganizationId),
      token,
    );
    expect(other.status).toBe(200);
    expect((other.body?.items as StaffDirectoryItem[])[0]?.identity).toEqual({
      email: "needle_email@example.com",
      firstName: "Other tenant",
      lastName: "Hidden",
    });
    expect((await page({ search: "Hidden" })).items).toEqual([]);
  });
  it.each([
    "Needle",
    "O’Connor",
    "needle_email",
    "مُحَمَّد Needle O’Connor",
    "NEEDLE_EMAIL",
  ])("finds %s beyond the first 50 before LIMIT", async (search) => {
    expect((await page()).items.map((item) => item.membershipId)).not.toContain(
      targetId,
    );
    expect(
      (await page({ search, limit: "1" })).items.map(
        (item) => item.membershipId,
      ),
    ).toEqual([targetId]);
  });
  it.each([
    { role: "VALET_SUPERVISOR" },
    { status: "INACTIVE" },
    { locationId: () => locationId },
  ])("applies exact filter before LIMIT: %s", async (filter) => {
    const input = Object.fromEntries(
      Object.entries(filter).map(([key, value]) => [
        key,
        typeof value === "function" ? value() : value,
      ]),
    );
    expect(
      (await page({ ...input, limit: "1" })).items.map(
        (item) => item.membershipId,
      ),
    ).toEqual([targetId]);
  });
  it("combines predicates and gives literal %, _ and backslash semantics", async () => {
    expect(
      (
        await page({
          search: "_%",
          role: "VALET_SUPERVISOR",
          status: "INACTIVE",
          locationId,
        })
      ).items.map((item) => item.membershipId),
    ).toEqual([targetId]);
    for (const search of ["%", "_"]) {
      expect(
        (await page({ search })).items.map((item) => item.membershipId),
      ).toEqual([targetId]);
    }
    expect((await page({ search: "\\" })).items).toEqual([]);
    expect((await page({ locationId: otherLocationId })).items).toEqual([]);
  });
  it("conceals foreign/missing Locations identically and requires current CA authority", async () => {
    const foreign = await fixture.managementGet(
      path({ locationId: foreignLocationId }),
      token,
    );
    const missing = await fixture.managementGet(
      path({ locationId: randomUUID() }),
      token,
    );
    expect(foreign.status).toBe(404);
    expect(missing.status).toBe(foreign.status);
    expect(missing.body?.code).toBe(foreign.body?.code);
    expect(JSON.stringify(foreign.body)).not.toContain(foreignLocationId);
    expect(
      (
        await fixture.managementGet(
          path({}, await fixture.createOrganization()),
          token,
        )
      ).status,
    ).toBe(404);
    await fixture.query(
      "UPDATE organization_memberships SET role='LOCATION_MANAGER' WHERE id=$1",
      [actorMembershipId],
    );
    try {
      expect((await fixture.managementGet(path(), token)).status).toBe(404);
    } finally {
      await fixture.query(
        "UPDATE organization_memberships SET role='ORG_ADMIN' WHERE id=$1",
        [actorMembershipId],
      );
    }
  });
  it("preserves deterministic equal-timestamp ordering and cursor/filter privacy", async () => {
    const expected = await fixture.query<{ id: string }>(
      "SELECT id::text FROM organization_memberships WHERE organization_id=$1 ORDER BY created_at,id",
      [organizationId],
    );
    const first = await page({ limit: "50" });
    const next = await page({ limit: "50", cursor: first.nextCursor! });
    expect(
      [...first.items, ...next.items].map((item) => item.membershipId),
    ).toEqual(expected.rows.map((row) => row.id));
    const filters = {
      search: "filler",
      role: "VALET_EMPLOYEE",
      status: "ACTIVE",
      limit: "1",
    };
    const filtered = await page(filters);
    const cursor = filtered.nextCursor!;
    const decoded = Buffer.from(cursor, "base64url").toString();
    expect(decoded).not.toContain("filler");
    expect(decoded).not.toContain("@example.com");
    expect(JSON.parse(decoded)).toMatchObject({ v: 2, k: "staff" });
    for (const change of [
      { search: "Needle" },
      { role: "ORG_ADMIN" },
      { status: "INACTIVE" },
      { locationId },
    ]) {
      expect(
        (
          await fixture.managementGet(
            path({ ...filters, ...change, cursor }),
            token,
          )
        ).status,
      ).toBe(400);
    }
    expect(
      (
        await fixture.managementGet(
          path({ ...filters, cursor }, foreignOrganizationId),
          token,
        )
      ).status,
    ).toBe(400);
  });
  it("revalidates persisted status, entitlement, User and Management assurance", async () => {
    const updates: [string, string, string, number][] = [
      [
        "UPDATE organization_memberships SET status='INACTIVE' WHERE id=$1",
        "UPDATE organization_memberships SET status='ACTIVE' WHERE id=$1",
        actorMembershipId,
        404,
      ],
      [
        "UPDATE organization_subscriptions SET dashboard_access_enabled=false WHERE organization_id=$1",
        "UPDATE organization_subscriptions SET dashboard_access_enabled=true WHERE organization_id=$1",
        organizationId,
        404,
      ],
      [
        "UPDATE users SET status='DISABLED' WHERE id=$1",
        "UPDATE users SET status='ACTIVE' WHERE id=$1",
        actorUserId,
        401,
      ],
      [
        "UPDATE organizations SET status='INACTIVE' WHERE id=$1",
        "UPDATE organizations SET status='ACTIVE' WHERE id=$1",
        organizationId,
        404,
      ],
    ];
    for (const [deny, restore, id, status] of updates) {
      await fixture.query(deny!, [id]);
      try {
        expect((await fixture.managementGet(path(), token)).status).toBe(
          status,
        );
      } finally {
        await fixture.query(restore!, [id]);
      }
    }
    const user = await fixture.createUser();
    await fixture.addMembership(organizationId, user.id, "ORG_ADMIN");
    const unassured = await fixture.nativeLogin(user);
    expect(
      (await fixture.managementGet(path(), unassured.accessToken)).status,
    ).toBe(403);
  });
});
