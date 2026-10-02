import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { ManagementControlPlaneTestFixture } from "./management-control-plane-test-fixture";
const fixture = new ManagementControlPlaneTestFixture();
beforeAll(() => fixture.start(), 120_000);
afterAll(() => fixture.stop(), 60_000);
async function seed(role: "ORG_ADMIN" | "LOCATION_MANAGER") {
  const user = await fixture.createUser(),
    actor = await fixture.createMembership(user.id, { role });
  const auth = await fixture.nativeLogin(user);
  if (role === "ORG_ADMIN") await fixture.enrollAndAssure(auth);
  const a = await fixture.addLocation(actor.organizationId),
    b = await fixture.addLocation(actor.organizationId),
    hidden = await fixture.addLocation(actor.organizationId);
  await fixture.query(
    "INSERT INTO membership_location_access(organization_id,membership_id,location_id) VALUES($1,$2,$3),($1,$2,$4)",
    [actor.organizationId, actor.membershipId, a.locationId, b.locationId],
  );
  const target = await fixture.createUser();
  const member = await fixture.addMembership(
    actor.organizationId,
    target.id,
    "ORG_ADMIN",
    "INACTIVE",
  );
  await fixture.query("UPDATE users SET status='DISABLED' WHERE id=$1", [
    target.id,
  ]);
  await fixture.query(
    `INSERT INTO shifts(id,organization_id,location_id,membership_id,status,started_at,ended_at)
    SELECT gen_random_uuid(),$1::uuid,CASE WHEN n<=55 THEN $2::uuid ELSE $3::uuid END,$4::uuid,'ENDED',
      '2026-10-01'::timestamptz + n*interval '1 minute','2026-10-02'::timestamptz
    FROM generate_series(1,110) n`,
    [actor.organizationId, a.locationId, hidden.locationId, member],
  );
  const hiddenId = (
    await fixture.query<{ id: string }>(
      "SELECT id::text FROM shifts WHERE location_id=$1 LIMIT 1",
      [hidden.locationId],
    )
  ).rows[0]!.id;
  const path = `/v1/staff/management/organizations/${actor.organizationId}/shifts`;
  return { ...actor, user, auth, a, b, hidden, member, hiddenId, path };
}
it("LM without new MFA policy reads visible history before LIMIT despite target lifecycle/role/grants", async () => {
  const s = await seed("LOCATION_MANAGER");
  const first = await fixture.managementGet(s.path, s.auth.accessToken);
  expect(first.status).toBe(200);
  const body = first.body as {
    items: { location: { locationId: string }; shiftId: string }[];
    nextCursor: string;
  };
  expect(body.items).toHaveLength(50);
  expect(
    body.items.every((row) => row.location.locationId === s.a.locationId),
  ).toBe(true);
  const second = await fixture.managementGet(
    `${s.path}?cursor=${body.nextCursor}`,
    s.auth.accessToken,
  );
  expect(second.body).toMatchObject({
    items: expect.any(Array),
    nextCursor: null,
  });
  expect(second.body?.items as unknown[]).toHaveLength(5);
  expect(
    (
      await fixture.managementGet(
        `${s.path}/${body.items[0]!.shiftId}`,
        s.auth.accessToken,
      )
    ).status,
  ).toBe(200);
  expect(
    (await fixture.managementGet(`${s.path}/${s.hiddenId}`, s.auth.accessToken))
      .status,
  ).toBe(404);
  expect(
    (
      await fixture.managementGet(
        `${s.path}?locationId=${s.hidden.locationId}`,
        s.auth.accessToken,
      )
    ).status,
  ).toBe(404);
  expect(
    (await fixture.managementGet(`${s.path}/employees`, s.auth.accessToken))
      .body,
  ).toMatchObject({ items: [{ membershipId: s.member }], nextCursor: null });
  await fixture.query(
    "UPDATE locations SET status='INACTIVE',accepting_intake=FALSE WHERE id=$1",
    [s.a.locationId],
  );
  expect(
    (await fixture.managementGet(s.path, s.auth.accessToken)).body,
  ).toEqual({ items: [], nextCursor: null });
  expect(
    (
      await fixture.managementGet(
        `${s.path}?locationId=${s.a.locationId}`,
        s.auth.accessToken,
      )
    ).status,
  ).toBe(404);
  expect(
    (
      await fixture.managementGet(
        `${s.path}?cursor=${body.nextCursor}`,
        s.auth.accessToken,
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await fixture.managementGet(
        `${s.path}/${body.items[0]!.shiftId}`,
        s.auth.accessToken,
      )
    ).status,
  ).toBe(404);
  expect(
    (await fixture.managementGet(`${s.path}/employees`, s.auth.accessToken))
      .body,
  ).toEqual({ items: [], nextCursor: null });
  await fixture.query("UPDATE locations SET status='ACTIVE' WHERE id=$1", [
    s.a.locationId,
  ]);
  await fixture.query(
    "DELETE FROM membership_location_access WHERE membership_id=$1 AND location_id=$2",
    [s.membershipId, s.a.locationId],
  );
  expect(
    (
      await fixture.managementGet(
        `${s.path}?cursor=${body.nextCursor}`,
        s.auth.accessToken,
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await fixture.managementGet(
        `${s.path}/${body.items[0]!.shiftId}`,
        s.auth.accessToken,
      )
    ).status,
  ).toBe(404);
  expect(
    (await fixture.managementGet(s.path, s.auth.accessToken)).body,
  ).toEqual({ items: [], nextCursor: null });
  expect(
    (await fixture.managementGet(`${s.path}/employees`, s.auth.accessToken))
      .body,
  ).toEqual({ items: [], nextCursor: null });
});
it("revalidates CA standard assurance, exact session, actor lifecycle, entitlement and tenant", async () => {
  const s = await seed("ORG_ADMIN");
  await fixture.query(
    "UPDATE staff_auth_sessions SET created_at=clock_timestamp()-interval '10 hours',mfa_authenticated_at=clock_timestamp()-interval '6 minutes' WHERE id=$1",
    [s.auth.sessionId],
  );
  for (const suffix of ["", `/${s.hiddenId}`, "/employees"])
    expect(
      (await fixture.managementGet(s.path + suffix, s.auth.accessToken)).status,
    ).toBe(200);
  const denied = async () => {
    for (const suffix of ["", `/${s.hiddenId}`, "/employees"])
      expect(
        (await fixture.managementGet(s.path + suffix, s.auth.accessToken))
          .status,
      ).toBeOneOf([401, 403, 404]);
  };
  for (const [table, column, id, value, restore] of [
    [
      "organization_memberships",
      "role",
      s.membershipId,
      "VALET_SUPERVISOR",
      "ORG_ADMIN",
    ],
    [
      "organization_memberships",
      "status",
      s.membershipId,
      "INACTIVE",
      "ACTIVE",
    ],
    ["users", "status", s.user.id, "DISABLED", "ACTIVE"],
    ["organizations", "status", s.organizationId, "INACTIVE", "ACTIVE"],
  ] as const) {
    await fixture.query(`UPDATE ${table} SET ${column}=$1 WHERE id=$2`, [
      value,
      id,
    ]);
    await denied();
    await fixture.query(`UPDATE ${table} SET ${column}=$1 WHERE id=$2`, [
      restore,
      id,
    ]);
  }
  await fixture.query(
    "UPDATE organization_subscriptions SET dashboard_access_enabled=FALSE WHERE organization_id=$1",
    [s.organizationId],
  );
  await denied();
  await fixture.query(
    "UPDATE organization_subscriptions SET dashboard_access_enabled=TRUE WHERE organization_id=$1",
    [s.organizationId],
  );
  expect(
    (
      await fixture.managementGet(
        s.path + `/${randomUUID()}`,
        s.auth.accessToken,
      )
    ).status,
  ).toBe(404);
  await fixture.query(
    "UPDATE staff_auth_sessions SET mfa_authenticated_at=clock_timestamp()-interval '9 hours' WHERE id=$1",
    [s.auth.sessionId],
  );
  await denied();
  await fixture.query(
    "UPDATE staff_auth_sessions SET mfa_authenticated_at=clock_timestamp(),last_admin_activity_at=clock_timestamp(),revoked_at=clock_timestamp() WHERE id=$1",
    [s.auth.sessionId],
  );
  await denied();
});
