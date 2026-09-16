import { randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { ManagementControlPlaneTestFixture } from "./management-control-plane-test-fixture";

const fixture = new ManagementControlPlaneTestFixture();

beforeAll(() => fixture.start(), 120_000);
afterEach(() => fixture.resetLimits());
afterAll(() => fixture.stop(), 60_000);

async function assuredAdmin() {
  const user = await fixture.createUser();
  const membership = await fixture.createMembership(user.id);
  const auth = await fixture.nativeLogin(user);
  await fixture.enrollAndAssure(auth);
  return { auth, membership };
}

async function baseTarget() {
  const actor = await assuredAdmin();
  const user = await fixture.createUser();
  const membershipId = await fixture.addMembership(
    actor.membership.organizationId,
    user.id,
    "VALET_EMPLOYEE",
  );
  const location = await fixture.addLocation(actor.membership.organizationId);
  await fixture.query(
    `INSERT INTO membership_location_access(organization_id,membership_id,location_id)
     VALUES($1,$2,$3)`,
    [actor.membership.organizationId, membershipId, location.locationId],
  );
  const base = `/v1/staff/management/organizations/${actor.membership.organizationId}/staff/${membershipId}`;
  return { actor, base, locationId: location.locationId, membershipId };
}

async function addSession(
  input: Awaited<ReturnType<typeof baseTarget>>,
  state: "AWAITING_PARKING" | "CHECKING_IN" | "PARKING",
) {
  const vehicleId = randomUUID();
  const sessionId = randomUUID();
  await fixture.query(
    `INSERT INTO vehicles(id,organization_id,temporary_descriptor,updated_at)
     VALUES($1,$2,$3,transaction_timestamp())`,
    [vehicleId, input.actor.membership.organizationId, `Blocker ${vehicleId}`],
  );
  await fixture.query(
    `INSERT INTO valet_sessions
       (id,customer_access_token_hash,customer_access_expires_at,
        organization_id,location_id,vehicle_id,state,checked_in_by_membership_id,
        version,updated_at)
     VALUES($1,$2,transaction_timestamp()+interval '1 hour',$3,$4,$5,$6,$7,1,
            transaction_timestamp())`,
    [
      sessionId,
      `disabled:blocker:${randomUUID()}`,
      input.actor.membership.organizationId,
      input.locationId,
      vehicleId,
      state,
      input.membershipId,
    ],
  );
  return sessionId;
}

async function addOwnedTask(
  input: Awaited<ReturnType<typeof baseTarget>>,
  status: "ACCEPTED" | "ASSIGNED" | "IN_PROGRESS",
) {
  const sessionId = await addSession(
    input,
    status === "IN_PROGRESS" ? "PARKING" : "AWAITING_PARKING",
  );
  const taskId = randomUUID();
  await fixture.query(
    `INSERT INTO tasks
       (id,organization_id,location_id,valet_session_id,task_type,status,
        current_assignee_membership_id,version,updated_at)
     VALUES($1,$2,$3,$4,'PARKING',$5,$6,1,transaction_timestamp())`,
    [
      taskId,
      input.actor.membership.organizationId,
      input.locationId,
      sessionId,
      status,
      input.membershipId,
    ],
  );
  return taskId;
}

async function expectRoleBlocked(input: Awaited<ReturnType<typeof baseTarget>>) {
  const result = await fixture.managementPost(
    `${input.base}/role`,
    input.actor.auth.accessToken,
    { expectedVersion: 1, role: "LOCATION_MANAGER" },
  );
  expect(result.status).toBe(409);
  expect(result.body).toMatchObject({ code: "STAFF_HANDOVER_REQUIRED" });
}

describe("MGT-BE-04 authoritative handover blockers", () => {
  for (const status of ["ASSIGNED", "ACCEPTED", "IN_PROGRESS"] as const) {
    it(`blocks operational role reduction for Task ${status} without relying on Shift`, async () => {
      const input = await baseTarget();
      await addOwnedTask(input, status);
      await expectRoleBlocked(input);
    });
  }

  it("blocks CHECKING_IN checked-in responsibility", async () => {
    const input = await baseTarget();
    await addSession(input, "CHECKING_IN");
    await expectRoleBlocked(input);
  });

  it("blocks AWAITING_PARKING checked-in responsibility until an active Parking Task exists", async () => {
    const input = await baseTarget();
    await addSession(input, "AWAITING_PARKING");
    await expectRoleBlocked(input);
  });

  it("scopes Task blockers to the exact revoked Location", async () => {
    const input = await baseTarget();
    const other = await fixture.addLocation(input.actor.membership.organizationId);
    await fixture.query(
      `INSERT INTO membership_location_access(organization_id,membership_id,location_id)
       VALUES($1,$2,$3)`,
      [input.actor.membership.organizationId, input.membershipId, other.locationId],
    );
    const vehicleId = randomUUID();
    const sessionId = randomUUID();
    await fixture.query(
      `INSERT INTO vehicles(id,organization_id,temporary_descriptor,updated_at)
       VALUES($1,$2,$3,transaction_timestamp())`,
      [vehicleId, input.actor.membership.organizationId, `Scoped ${vehicleId}`],
    );
    await fixture.query(
      `INSERT INTO valet_sessions
         (id,customer_access_token_hash,customer_access_expires_at,
          organization_id,location_id,vehicle_id,state,checked_in_by_membership_id,
          version,updated_at)
       VALUES($1,$2,transaction_timestamp()+interval '1 hour',$3,$4,$5,
              'AWAITING_PARKING',$6,1,transaction_timestamp())`,
      [
        sessionId,
        `disabled:scoped:${randomUUID()}`,
        input.actor.membership.organizationId,
        other.locationId,
        vehicleId,
        input.membershipId,
      ],
    );
    await fixture.query(
      `INSERT INTO tasks
         (id,organization_id,location_id,valet_session_id,task_type,status,
          current_assignee_membership_id,version,updated_at)
       VALUES($1,$2,$3,$4,'PARKING','ASSIGNED',$5,1,transaction_timestamp())`,
      [
        randomUUID(),
        input.actor.membership.organizationId,
        other.locationId,
        sessionId,
        input.membershipId,
      ],
    );
    const safe = await fixture.managementPost(
      `${input.base}/location-access/revoke`,
      input.actor.auth.accessToken,
      { expectedVersion: 1, locationIds: [input.locationId] },
    );
    expect(safe.status).toBe(201);
    const blocked = await fixture.managementPost(
      `${input.base}/location-access/revoke`,
      input.actor.auth.accessToken,
      { expectedVersion: 2, locationIds: [other.locationId] },
    );
    expect(blocked.status).toBe(409);
    expect(blocked.body).toMatchObject({ code: "STAFF_HANDOVER_REQUIRED" });
  });
});
