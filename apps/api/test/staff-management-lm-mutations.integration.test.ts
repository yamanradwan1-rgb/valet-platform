import { randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { ManagementControlPlaneTestFixture } from "./management-control-plane-test-fixture";

const fixture = new ManagementControlPlaneTestFixture();

beforeAll(() => fixture.start(), 120_000);
afterEach(() => fixture.resetLimits());
afterAll(() => fixture.stop(), 60_000);

function staffPath(organizationId: string, membershipId?: string): string {
  return `/v1/staff/management/organizations/${organizationId}/staff${
    membershipId === undefined ? "" : `/${membershipId}`
  }`;
}

async function addGrant(
  organizationId: string,
  membershipId: string,
  locationId: string,
) {
  await fixture.query(
    `INSERT INTO membership_location_access(organization_id,membership_id,location_id)
     VALUES($1,$2,$3)`,
    [organizationId, membershipId, locationId],
  );
}

async function createLm(options: { assure?: boolean } = {}) {
  const user = await fixture.createUser();
  const membership = await fixture.createMembership(user.id, {
    role: "LOCATION_MANAGER",
  });
  const locationA = await fixture.addLocation(membership.organizationId, {
    name: "Alpha",
  });
  const locationB = await fixture.addLocation(membership.organizationId, {
    name: "Beta",
  });
  const locationC = await fixture.addLocation(membership.organizationId, {
    name: "Hidden",
  });
  await addGrant(
    membership.organizationId,
    membership.membershipId,
    locationA.locationId,
  );
  await addGrant(
    membership.organizationId,
    membership.membershipId,
    locationB.locationId,
  );
  const auth = await fixture.nativeLogin(user);
  if (options.assure !== false) await fixture.enrollAndAssure(auth);
  return { auth, locationA, locationB, locationC, membership };
}

async function addTarget(
  organizationId: string,
  locationIds: readonly string[],
) {
  const user = await fixture.createUser();
  const membershipId = await fixture.addMembership(
    organizationId,
    user.id,
    "VALET_EMPLOYEE",
  );
  for (const locationId of locationIds)
    await addGrant(organizationId, membershipId, locationId);
  return { membershipId, user };
}

async function expectHidden(response: {
  readonly status: number;
  readonly body: unknown;
}) {
  expect(response.status).toBe(404);
  expect(response.body).toMatchObject({ code: "AUTHORIZATION_DENIED" });
}

describe("T05-B Location Manager mutations and grant paging", () => {
  it("requires sensitive MFA and permits only covered Employee/Supervisor mutations", async () => {
    const actor = await createLm({ assure: false });
    const org = actor.membership.organizationId;
    const target = await addTarget(org, [actor.locationA.locationId]);
    const base = staffPath(org, target.membershipId);
    const denied = await fixture.managementPost(
      `${base}/role`,
      actor.auth.accessToken,
      { expectedVersion: 1, role: "VALET_SUPERVISOR" },
    );
    expect(denied.status).toBe(403);
    expect(denied.body).toMatchObject({ code: "MFA_STEP_UP_REQUIRED" });
    await fixture.enrollAndAssure(actor.auth);

    const promoted = await fixture.managementPost(
      `${base}/role`,
      actor.auth.accessToken,
      { expectedVersion: 1, role: "VALET_SUPERVISOR" },
    );
    expect(promoted.status).toBe(201);
    expect(promoted.body).toMatchObject({
      role: "VALET_SUPERVISOR",
      version: 2,
    });
    const retry = await fixture.managementPost(
      `${base}/role`,
      actor.auth.accessToken,
      { expectedVersion: 1, role: "VALET_SUPERVISOR" },
    );
    expect(retry.status).toBe(201);
    expect(retry.body).toMatchObject({ version: 2 });
    await expectHidden(
      await fixture.managementPost(`${base}/role`, actor.auth.accessToken, {
        expectedVersion: 2,
        role: "LOCATION_MANAGER",
      }),
    );

    const granted = await fixture.managementPost(
      `${base}/location-access/grant`,
      actor.auth.accessToken,
      { expectedVersion: 2, locationIds: [actor.locationB.locationId] },
    );
    expect(granted.status).toBe(201);
    expect(granted.body).toMatchObject({ locationAccessCount: 2, version: 3 });
    await expectHidden(
      await fixture.managementPost(
        `${base}/location-access/grant`,
        actor.auth.accessToken,
        {
          expectedVersion: 3,
          locationIds: [actor.locationC.locationId],
        },
      ),
    );
    await expectHidden(
      await fixture.managementPost(
        `${base}/location-access/revoke`,
        actor.auth.accessToken,
        {
          expectedVersion: 3,
          locationIds: [actor.locationA.locationId, actor.locationB.locationId],
        },
      ),
    );
    const revoked = await fixture.managementPost(
      `${base}/location-access/revoke`,
      actor.auth.accessToken,
      { expectedVersion: 3, locationIds: [actor.locationB.locationId] },
    );
    expect(revoked.status).toBe(201);
    expect(revoked.body).toMatchObject({ locationAccessCount: 1, version: 4 });
    const deactivated = await fixture.managementPost(
      `${base}/deactivate`,
      actor.auth.accessToken,
      { expectedVersion: 4 },
    );
    expect(deactivated.status).toBe(201);
    expect(deactivated.body).toMatchObject({ status: "INACTIVE", version: 5 });
    const user = await fixture.query<{ status: string }>(
      `SELECT status::text FROM users WHERE id=$1`,
      [target.user.id],
    );
    expect(user.rows[0]?.status).toBe("ACTIVE");
    const audit = await fixture.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM audit_events
       WHERE organization_id=$1 AND entity_id=$2 AND event_type LIKE 'STAFF_%'`,
      [org, target.membershipId],
    );
    expect(audit.rows[0]?.count).toBe("4");
  }, 15_000);

  it("pages more than 100 grants and returns bounded candidate state without CA authority", async () => {
    const actor = await createLm();
    const org = actor.membership.organizationId;
    const target = await addTarget(org, [actor.locationA.locationId]);
    const rows = Array.from({ length: 104 }, () => ({ id: randomUUID() }));
    for (const [index, row] of rows.entries()) {
      await fixture.query(
        `INSERT INTO locations
           (id,organization_id,name,code,address_text,timezone,currency,status,accepting_intake,updated_at)
         VALUES($1,$2,$3,$4,'Address','Asia/Amman','JOD','ACTIVE',TRUE,clock_timestamp())`,
        [row.id, org, `Paged ${index}`, `P-${index}`],
      );
      await addGrant(org, actor.membership.membershipId, row.id);
      await addGrant(org, target.membershipId, row.id);
    }
    const path = `${staffPath(org, target.membershipId)}/location-access`;
    const candidates = await fixture.managementGet(
      `${path}/candidates?limit=100`,
      actor.auth.accessToken,
    );
    expect(candidates.status).toBe(200);
    const candidatePage = candidates.body as {
      items: Array<{ granted: boolean; locationId: string }>;
      nextCursor: string | null;
    };
    const candidateItems = [...candidatePage.items];
    if (candidatePage.nextCursor !== null) {
      const nextCandidates = await fixture.managementGet(
        `${path}/candidates?limit=100&cursor=${encodeURIComponent(candidatePage.nextCursor)}`,
        actor.auth.accessToken,
      );
      expect(nextCandidates.status).toBe(200);
      candidateItems.push(
        ...(
          nextCandidates.body as {
            items: Array<{ granted: boolean; locationId: string }>;
          }
        ).items,
      );
    }
    expect(
      candidateItems.find(
        (item) => item.locationId === actor.locationB.locationId,
      ),
    ).toMatchObject({ granted: false });
    expect(
      candidateItems.find(
        (item) => item.locationId === actor.locationA.locationId,
      ),
    ).toMatchObject({ granted: true });

    const first = await fixture.managementGet(
      `${path}?limit=50`,
      actor.auth.accessToken,
    );
    expect(first.status).toBe(200);
    expect((first.body as { items: unknown[] }).items).toHaveLength(50);
    expect(
      (first.body as { items: Array<{ code: string; name: string }> }).items[0],
    ).toMatchObject({ code: expect.any(String), name: expect.any(String) });
    const secondCursor = String(
      (first.body as { nextCursor: string }).nextCursor,
    );
    const second = await fixture.managementGet(
      `${path}?limit=50&cursor=${encodeURIComponent(secondCursor)}`,
      actor.auth.accessToken,
    );
    expect((second.body as { items: unknown[] }).items).toHaveLength(50);
    const thirdCursor = String(
      (second.body as { nextCursor: string }).nextCursor,
    );
    const third = await fixture.managementGet(
      `${path}?limit=50&cursor=${encodeURIComponent(thirdCursor)}`,
      actor.auth.accessToken,
    );
    expect((third.body as { items: unknown[] }).items).toHaveLength(5);
    await expectHidden(
      await fixture.managementGet(
        `/v1/staff/management/organizations/${org}/locations`,
        actor.auth.accessToken,
      ),
    );
  });
});
