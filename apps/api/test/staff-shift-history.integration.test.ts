import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { ManagementControlPlaneTestFixture } from "./management-control-plane-test-fixture";

const fixture = new ManagementControlPlaneTestFixture();
beforeAll(() => fixture.start(), 120_000);
afterAll(() => fixture.stop(), 60_000);

async function seed() {
  const user = await fixture.createUser();
  const actor = await fixture.createMembership(user.id);
  const auth = await fixture.nativeLogin(user);
  await fixture.enrollAndAssure(auth);
  const a = await fixture.addLocation(actor.organizationId);
  const b = await fixture.addLocation(actor.organizationId, {
    status: "INACTIVE",
  });
  const target = await fixture.createUser();
  const membershipId = await fixture.addMembership(
    actor.organizationId,
    target.id,
    "VALET_EMPLOYEE",
    "INACTIVE",
  );
  await fixture.query(
    "UPDATE organization_memberships SET first_name='محمّد',last_name='O’Connor' WHERE id=$1",
    [membershipId],
  );
  await fixture.query("UPDATE users SET status='DISABLED' WHERE id=$1", [
    target.id,
  ]);
  const ids: string[] = [];
  for (let n = 0; n < 55; n++) {
    const id = randomUUID();
    ids.push(id);
    await fixture.query(
      `INSERT INTO shifts(id,organization_id,location_id,membership_id,status,started_at,ended_at)
      VALUES($1,$2,$3,$4,'ENDED','2026-10-01T05:00:00Z','2026-10-01T07:00:00Z')`,
      [
        id,
        actor.organizationId,
        n % 2 ? a.locationId : b.locationId,
        membershipId,
      ],
    );
  }
  const activeId = randomUUID();
  await fixture.query(
    `INSERT INTO shifts(id,organization_id,location_id,membership_id,status,started_at)
    VALUES($1,$2,$3,$4,'ACTIVE','2026-10-02T05:00:00Z')`,
    [activeId, actor.organizationId, a.locationId, membershipId],
  );
  return {
    ...actor,
    a,
    b,
    membershipId: membershipId,
    actorMembershipId: actor.membershipId,
    targetUserId: target.id,
    token: auth.accessToken,
    ids,
    activeId,
    path: `/v1/staff/management/organizations/${actor.organizationId}/shifts`,
  };
}

it("reads current identity and ended inactive/disabled-target history with stable ties across pages", async () => {
  const s = await seed();
  const snapshot = async () =>
    (
      await fixture.query(
        "SELECT id,status,started_at,ended_at,cash_expected,cash_reported,cash_variance FROM shifts WHERE organization_id=$1 ORDER BY id",
        [s.organizationId],
      )
    ).rows;
  const before = await snapshot();
  const auditBefore = (
    await fixture.query<{ count: string }>(
      "SELECT count(*)::text FROM audit_events WHERE organization_id=$1 AND entity_type='Shift'",
      [s.organizationId],
    )
  ).rows[0]!.count;
  const first = await fixture.managementGet(s.path, s.token);
  expect(first.status).toBe(200);
  expect(first.headers.get("cache-control")).toContain("no-store");
  const body = first.body as {
    items: Array<{ shiftId: string; identity: unknown; currentRole: string }>;
    nextCursor: string;
  };
  expect(body.items).toHaveLength(50);
  expect(body.items[0]).toMatchObject({
    shiftId: s.activeId,
    identity: { firstName: "محمّد", lastName: "O’Connor" },
    currentRole: "VALET_EMPLOYEE",
  });
  const second = await fixture.managementGet(
    `${s.path}?cursor=${body.nextCursor}`,
    s.token,
  );
  expect(second.status).toBe(200);
  const rest = second.body as {
    items: Array<{ shiftId: string }>;
    nextCursor: null;
  };
  expect(rest.items).toHaveLength(6);
  expect(rest.nextCursor).toBeNull();
  expect([...body.items, ...rest.items].map((row) => row.shiftId)).toEqual([
    s.activeId,
    ...s.ids.sort().reverse(),
  ]);
  const detail = await fixture.managementGet(`${s.path}/${s.ids[0]}`, s.token);
  expect(detail.status).toBe(200);
  expect(detail.body).toMatchObject({
    membershipId: s.membershipId,
    status: "ENDED",
    endedAt: "2026-10-01T07:00:00.000Z",
  });
  expect(detail.body).not.toHaveProperty("cashReconciliation");
  expect(await snapshot()).toEqual(before);
  expect(
    (
      await fixture.query<{ count: string }>(
        "SELECT count(*)::text FROM audit_events WHERE organization_id=$1 AND entity_type='Shift'",
        [s.organizationId],
      )
    ).rows[0]!.count,
  ).toBe(auditBefore);
  await fixture.query(
    "UPDATE organization_memberships SET role='ORG_ADMIN' WHERE id=$1",
    [s.membershipId],
  );
  expect(
    (await fixture.managementGet(`${s.path}/${s.ids[0]}`, s.token)).body,
  ).toMatchObject({ currentRole: "ORG_ADMIN" });
});

it("applies exact membership/location/status/started interval before LIMIT and validates strict input", async () => {
  const s = await seed();
  const active = await fixture.managementGet(
    `${s.path}?limit=1&status=ACTIVE&membershipId=${s.membershipId}&locationId=${s.a.locationId}&from=2026-10-02T05:00:00Z&to=2026-10-03T05:00:00Z`,
    s.token,
  );
  expect(active.status).toBe(200);
  expect(active.body).toMatchObject({
    items: [{ shiftId: s.activeId }],
    nextCursor: null,
  });
  const exclusive = await fixture.managementGet(
    `${s.path}?to=2026-10-01T05:00:00Z`,
    s.token,
  );
  expect(exclusive.body).toEqual({ items: [], nextCursor: null });
  for (const query of [
    "from=bad",
    "from=2026-10-01T05:00:00Z&to=2026-10-01T05:00:00Z",
    "unknown=1",
    "limit=101",
    "status=ACTIVE&status=ENDED",
  ]) {
    expect(
      (await fixture.managementGet(`${s.path}?${query}`, s.token)).status,
    ).toBe(400);
  }
});

it("binds cursors to CA membership identity, filters and organization; candidates include visible history", async () => {
  const s = await seed();
  const first = await fixture.managementGet(`${s.path}?limit=1`, s.token);
  expect(first.status).toBe(200);
  const cursor = String(first.body?.nextCursor);
  const changed = await fixture.managementGet(
    `${s.path}?limit=1&status=ENDED&cursor=${cursor}`,
    s.token,
  );
  expect(changed.status).toBe(400);
  const user = await fixture.createUser();
  await fixture.addMembership(s.organizationId, user.id, "ORG_ADMIN");
  const auth = await fixture.nativeLogin(user);
  await fixture.enrollAndAssure(auth);
  expect(
    (
      await fixture.managementGet(
        `${s.path}?cursor=${cursor}`,
        auth.accessToken,
      )
    ).status,
  ).toBe(400);
  const candidates = await fixture.managementGet(
    `${s.path}/employees?search=${encodeURIComponent("محمّد")}`,
    s.token,
  );
  expect(candidates.status).toBe(200);
  expect(candidates.body).toMatchObject({
    items: [{ membershipId: s.membershipId }],
    nextCursor: null,
  });
  expect(
    (await fixture.managementGet(`${s.path}/employees?search=%25`, s.token))
      .body,
  ).toEqual({ items: [], nextCursor: null });
  const foreign = await fixture.createOrganization();
  const hidden = await fixture.managementGet(
    `/v1/staff/management/organizations/${foreign}/shifts/${s.activeId}`,
    s.token,
  );
  expect(hidden.status).toBe(404);
});
