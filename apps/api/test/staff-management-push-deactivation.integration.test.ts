import { randomUUID } from "node:crypto";

import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  createRuntimePostgresPool,
  type PostgresPool,
} from "../src/common/database/postgres";
import { inPostgresTransaction } from "../src/common/database/postgres-transaction";
import { persistRetrievalPushAttention } from "../src/modules/staff-push/retrieval-push-attention-writer";
import { StaffPushDeliveryWorker } from "../src/modules/staff-push/staff-push-delivery-worker";
import type { StaffPushProvider } from "../src/modules/staff-push/staff-push-provider";
import { ManagementControlPlaneTestFixture } from "./management-control-plane-test-fixture";
import { syntheticStaffPushPolicy } from "./staff-push-policy-test-value";
import { providerSendResult } from "./staff-push-provider-test-value";

const fixture = new ManagementControlPlaneTestFixture();
const policy = { ...syntheticStaffPushPolicy, sendingEnabled: true };
let runtimePool: PostgresPool;

beforeAll(async () => {
  await fixture.start();
  runtimePool = createRuntimePostgresPool(fixture.runtimeDatabaseUrl());
}, 120_000);

afterEach(() => fixture.resetLimits());

afterAll(async () => {
  await runtimePool?.end();
  await fixture.stop();
}, 60_000);

async function assuredAdmin() {
  const user = await fixture.createUser();
  const membership = await fixture.createMembership(user.id);
  const auth = await fixture.nativeLogin(user);
  await fixture.enrollAndAssure(auth);
  return { auth, membership };
}

async function seedPushScope(input: {
  label: string;
  locationId: string;
  membershipId: string;
  organizationId: string;
  withShift?: boolean;
}) {
  const shiftId = randomUUID();
  const vehicleId = randomUUID();
  const valetSessionId = randomUUID();
  const taskId = randomUUID();
  if (input.withShift !== false) {
    await fixture.query(
      `INSERT INTO shifts(id,organization_id,location_id,membership_id,status,started_at)
       VALUES($1,$2,$3,$4,'ACTIVE',clock_timestamp())`,
      [shiftId, input.organizationId, input.locationId, input.membershipId],
    );
  }
  await fixture.query(
    `INSERT INTO vehicles(id,organization_id,temporary_descriptor,updated_at)
     VALUES($1,$2,$3,clock_timestamp())`,
    [vehicleId, input.organizationId, input.label],
  );
  await fixture.query(
    `INSERT INTO valet_sessions
       (id,customer_access_token_hash,customer_access_expires_at,
        organization_id,location_id,vehicle_id,state,checked_in_by_membership_id,
        retrieval_requested_at,version,updated_at)
     VALUES($1,$2,clock_timestamp()+interval '1 hour',$3,$4,$5,'REQUESTED',$6,
            clock_timestamp(),1,clock_timestamp())`,
    [
      valetSessionId,
      `push-deactivation:${randomUUID()}`,
      input.organizationId,
      input.locationId,
      vehicleId,
      input.membershipId,
    ],
  );
  await fixture.query(
    `INSERT INTO tasks
       (id,organization_id,location_id,valet_session_id,task_type,status,version,
        created_at,updated_at)
     VALUES($1,$2,$3,$4,'RETRIEVAL','QUEUED',1,clock_timestamp(),clock_timestamp())`,
    [taskId, input.organizationId, input.locationId, valetSessionId],
  );
  return { shiftId, taskId, valetSessionId };
}

async function queueAttention(
  scope: {
    locationId: string;
    organizationId: string;
    taskId: string;
    valetSessionId: string;
  },
  operationTime: Date,
) {
  return inPostgresTransaction(runtimePool, (transaction) =>
    persistRetrievalPushAttention(
      transaction,
      scope,
      operationTime,
      syntheticStaffPushPolicy.employeeRetrievalRequested,
    ),
  );
}

async function deliveryState(intentId: string): Promise<string> {
  const result = await fixture.query<{ state: string }>(
    `SELECT state::text FROM staff_push_deliveries WHERE intent_id=$1`,
    [intentId],
  );
  return result.rows[0]!.state;
}

describe("MGT-BE-04 tenant deactivation and Staff Push", () => {
  it("suppresses Organization A attention while the same session remains usable in Organization B", async () => {
    const actor = await assuredAdmin();
    const target = await fixture.createUser();
    const organizationA = actor.membership.organizationId;
    const membershipA = await fixture.addMembership(
      organizationA,
      target.id,
      "VALET_EMPLOYEE",
    );
    const organizationB = await fixture.createOrganization();
    const membershipB = await fixture.addMembership(
      organizationB,
      target.id,
      "VALET_EMPLOYEE",
    );
    const locationA = await fixture.addLocation(organizationA);
    const locationB = await fixture.addLocation(organizationB);
    await fixture.query(
      `INSERT INTO membership_location_access(organization_id,membership_id,location_id)
       VALUES($1,$2,$3),($4,$5,$6)`,
      [
        organizationA,
        membershipA,
        locationA.locationId,
        organizationB,
        membershipB,
        locationB.locationId,
      ],
    );

    const auth = await fixture.nativeLogin(target);
    const registrationId = randomUUID();
    await fixture.query(
      `INSERT INTO staff_push_registrations
         (id,staff_auth_session_id,provider,platform,app_identifier,installation_id,
          provider_token,token_hash,app_version,app_build,locale)
       VALUES($1,$2,'FCM','ANDROID','com.vaylet.employee',$3,$4,$5,'1','1','en')`,
      [
        registrationId,
        auth.sessionId,
        randomUUID(),
        `provider-${randomUUID()}`,
        `staff-push-token-sha256:v1:${"d".repeat(64)}`,
      ],
    );

    const scopeA = await seedPushScope({
      label: "push-org-a",
      locationId: locationA.locationId,
      membershipId: membershipA,
      organizationId: organizationA,
    });
    const scopeB = await seedPushScope({
      label: "push-org-b",
      locationId: locationB.locationId,
      membershipId: membershipB,
      organizationId: organizationB,
    });
    const newScopeA = await seedPushScope({
      label: "push-org-a-after-deactivation",
      locationId: locationA.locationId,
      membershipId: membershipA,
      organizationId: organizationA,
      withShift: false,
    });
    const clock = await fixture.query<{ now: Date }>(
      "SELECT clock_timestamp() AS now",
    );
    const now = clock.rows[0]!.now;
    const queuedA = await queueAttention(
      {
        ...scopeA,
        locationId: locationA.locationId,
        organizationId: organizationA,
      },
      new Date(now.getTime() - 2_000),
    );
    const queuedB = await queueAttention(
      {
        ...scopeB,
        locationId: locationB.locationId,
        organizationId: organizationB,
      },
      new Date(now.getTime() - 1_000),
    );
    expect(queuedA.deliveryCount).toBe(1);
    expect(queuedB.deliveryCount).toBe(1);

    await fixture.query(
      `UPDATE shifts SET status='ENDED',ended_at=clock_timestamp() WHERE id=$1`,
      [scopeA.shiftId],
    );
    const deactivated = await fixture.managementPost(
      `/v1/staff/management/organizations/${organizationA}/staff/${membershipA}/deactivate`,
      actor.auth.accessToken,
      { expectedVersion: 1 },
    );
    expect(deactivated.status).toBe(201);
    expect(deactivated.body).toMatchObject({ status: "INACTIVE", version: 2 });

    const global = await fixture.query<{
      b_status: string;
      push_state: string;
      revoked_at: Date | null;
      user_status: string;
    }>(
      `SELECT staff_user.status::text AS user_status,
              membership_b.status::text AS b_status,session.revoked_at,
              registration.state::text AS push_state
       FROM users AS staff_user
       INNER JOIN organization_memberships AS membership_b ON membership_b.id=$2
       INNER JOIN staff_auth_sessions AS session ON session.id=$3
       INNER JOIN staff_push_registrations AS registration ON registration.id=$4
       WHERE staff_user.id=$1`,
      [target.id, membershipB, auth.sessionId, registrationId],
    );
    expect(global.rows[0]).toEqual({
      b_status: "ACTIVE",
      push_state: "ACTIVE",
      revoked_at: null,
      user_status: "ACTIVE",
    });

    const newA = await queueAttention(
      {
        ...newScopeA,
        locationId: locationA.locationId,
        organizationId: organizationA,
      },
      new Date(),
    );
    expect(newA.deliveryCount).toBe(0);

    const send = vi
      .fn<StaffPushProvider["send"]>()
      .mockResolvedValue(providerSendResult({ resultClass: "ACCEPTED" }));
    const worker = new StaffPushDeliveryWorker(
      runtimePool,
      policy,
      { send },
      { observe: () => undefined },
      () => 0.5,
    );
    await expect(worker.runOnce()).resolves.toBe(true);
    expect(send).not.toHaveBeenCalled();
    expect(await deliveryState(queuedA.intentId)).toBe("SUPPRESSED");

    await expect(worker.runOnce()).resolves.toBe(true);
    expect(send).toHaveBeenCalledOnce();
    expect(await deliveryState(queuedB.intentId)).toBe("PROVIDER_ACCEPTED");
  }, 30_000);
});
