import { afterAll, beforeAll, expect, it } from "vitest";
import { ManagementControlPlaneTestFixture } from "./management-control-plane-test-fixture";
const fixture = new ManagementControlPlaneTestFixture();
beforeAll(() => fixture.start(), 120_000);
afterAll(() => fixture.stop(), 60_000);
it("pages history-authorized candidates without cross-tenant global User leakage or target management predicates", async () => {
  const user = await fixture.createUser(),
    actor = await fixture.createMembership(user.id, {
      role: "LOCATION_MANAGER",
    });
  const auth = await fixture.nativeLogin(user),
    foreign = await fixture.createOrganization();
  const a = await fixture.addLocation(actor.organizationId),
    hidden = await fixture.addLocation(actor.organizationId),
    other = await fixture.addLocation(foreign);
  await fixture.query(
    "INSERT INTO membership_location_access(organization_id,membership_id,location_id) VALUES($1,$2,$3)",
    [actor.organizationId, actor.membershipId, a.locationId],
  );
  await fixture.query(
    `WITH accounts AS (
    INSERT INTO users(id,email,password_hash,status,updated_at)
    SELECT gen_random_uuid(),'history-candidate-' || n || '-' || $1 || '@example.com','fixture','DISABLED',now()
    FROM generate_series(1,120) n RETURNING id,email
  ) INSERT INTO organization_memberships(id,organization_id,user_id,role,status,first_name,last_name,updated_at)
    SELECT gen_random_uuid(),org,id,'ORG_ADMIN','INACTIVE','Candidate','Sample',now()
    FROM accounts CROSS JOIN unnest(ARRAY[$1::uuid,$2::uuid]) org`,
    [actor.organizationId, foreign],
  );
  await fixture.query(
    `INSERT INTO shifts(id,organization_id,location_id,membership_id,status,started_at,ended_at)
    SELECT gen_random_uuid(),m.organization_id,CASE WHEN m.organization_id=$1::uuid
      THEN CASE WHEN split_part(u.email,'-',3)::int <= 60 THEN $2::uuid ELSE $3::uuid END ELSE $4::uuid END,
      m.id,'ENDED','2026-10-01T00:00:00Z','2026-10-01T08:00:00Z'
    FROM organization_memberships m JOIN users u ON u.id=m.user_id
    WHERE m.organization_id IN ($1::uuid,$5::uuid) AND u.email LIKE 'history-candidate-%'`,
    [
      actor.organizationId,
      a.locationId,
      hidden.locationId,
      other.locationId,
      foreign,
    ],
  );
  const path = `/v1/staff/management/organizations/${actor.organizationId}/shifts`;
  const first = await fixture.managementGet(
    `${path}/employees`,
    auth.accessToken,
  );
  expect(first.status).toBe(200);
  const body = first.body as {
    items: { membershipId: string; identity: { email: string } }[];
    nextCursor: string;
  };
  expect(body.items).toHaveLength(50);
  expect(first.headers.get("cache-control")).toContain("no-store");
  const second = await fixture.managementGet(
    `${path}/employees?cursor=${body.nextCursor}`,
    auth.accessToken,
  );
  expect(second.status).toBe(200);
  const rest = second.body as {
    items: { membershipId: string; identity: { email: string } }[];
    nextCursor: null;
  };
  expect(rest.items).toHaveLength(10);
  expect(rest.nextCursor).toBeNull();
  const all = [...body.items, ...rest.items];
  expect(new Set(all.map((item) => item.membershipId)).size).toBe(60);
  expect(all.map((item) => item.membershipId)).toEqual(
    all.map((item) => item.membershipId).sort(),
  );
  expect(
    all.every((item) => Number(item.identity.email.split("-")[2]) <= 60),
  ).toBe(true);
  expect(
    (
      await fixture.managementGet(
        `${path}/employees?search=absent&cursor=${body.nextCursor}`,
        auth.accessToken,
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await fixture.managementGet(
        `${path}?cursor=${body.nextCursor}`,
        auth.accessToken,
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await fixture.managementGet(
        `${path}/employees?locationId=${hidden.locationId}`,
        auth.accessToken,
      )
    ).status,
  ).toBe(404);
  const foreignMember = (
    await fixture.query<{ id: string }>(
      "SELECT id::text FROM organization_memberships WHERE organization_id=$1 LIMIT 1",
      [foreign],
    )
  ).rows[0]!.id;
  expect(
    (
      await fixture.managementGet(
        `${path}?membershipId=${foreignMember}`,
        auth.accessToken,
      )
    ).body,
  ).toEqual({ items: [], nextCursor: null });
  expect(
    (
      await fixture.managementGet(
        `${path}/employees?unknown=1`,
        auth.accessToken,
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await fixture.managementGet(
        `${path}/employees?limit=101`,
        auth.accessToken,
      )
    ).status,
  ).toBe(400);
});
