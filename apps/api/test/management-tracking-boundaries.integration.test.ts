import { randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { ManagementControlPlaneTestFixture } from "./management-control-plane-test-fixture";

const fixture = new ManagementControlPlaneTestFixture();

beforeAll(() => fixture.start(), 120_000);
afterEach(() => fixture.resetLimits());
afterAll(() => fixture.stop(), 60_000);

async function trackedAdmin() {
  const admin = await fixture.createUser();
  const membership = await fixture.createMembership(admin.id, {
    name: "Tracking boundary org",
  });
  const location = await fixture.addLocation(membership.organizationId, {
    name: "Tracking boundary location",
  });
  const worker = await fixture.createUser();
  const workerMembershipId = await fixture.addMembership(
    membership.organizationId,
    worker.id,
    "VALET_EMPLOYEE",
  );
  const vehicleId = randomUUID();
  const valetSessionId = randomUUID();
  const taskId = randomUUID();
  const trackingSessionId = randomUUID();

  await fixture.query(
    `UPDATE organizations SET tracking_enabled = true,
            updated_at = transaction_timestamp() WHERE id = $1`,
    [membership.organizationId],
  );
  await fixture.query(
    `INSERT INTO vehicles
       (id, organization_id, temporary_descriptor, updated_at)
     VALUES ($1, $2, 'Management tracking vehicle', transaction_timestamp())`,
    [vehicleId, membership.organizationId],
  );
  await fixture.query(
    `INSERT INTO valet_sessions
       (id, customer_access_token_hash, customer_access_expires_at,
        organization_id, location_id, vehicle_id, state,
        current_assignee_membership_id, checked_in_by_membership_id,
        parking_started_at, updated_at)
     VALUES ($1, $2, transaction_timestamp() + interval '1 day', $3, $4, $5,
             'PARKING', $6, $6, transaction_timestamp(), transaction_timestamp())`,
    [
      valetSessionId,
      randomUUID(),
      membership.organizationId,
      location.locationId,
      vehicleId,
      workerMembershipId,
    ],
  );
  await fixture.query(
    `INSERT INTO tasks
       (id, organization_id, location_id, valet_session_id, task_type,
        status, current_assignee_membership_id, updated_at)
     VALUES ($1, $2, $3, $4, 'PARKING', 'IN_PROGRESS', $5,
             transaction_timestamp())`,
    [
      taskId,
      membership.organizationId,
      location.locationId,
      valetSessionId,
      workerMembershipId,
    ],
  );
  await fixture.query(
    `INSERT INTO task_tracking_sessions
       (id, organization_id, location_id, valet_session_id, task_id, started_at)
     VALUES ($1, $2, $3, $4, $5, transaction_timestamp() - interval '1 minute')`,
    [
      trackingSessionId,
      membership.organizationId,
      location.locationId,
      valetSessionId,
      taskId,
    ],
  );
  await fixture.query(
    `INSERT INTO raw_gps_samples
       (id, organization_id, location_id, valet_session_id, task_id,
        tracking_session_id, client_sample_id, latitude, longitude, captured_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 31.9539, 35.9106,
             transaction_timestamp())`,
    [
      randomUUID(),
      membership.organizationId,
      location.locationId,
      valetSessionId,
      taskId,
      trackingSessionId,
      randomUUID(),
    ],
  );

  const auth = await fixture.nativeLogin(admin);
  await fixture.enrollAndAssure(auth);
  return { auth, location, membership, trackingSessionId };
}

describe("MGT-BE-03 Company Admin tracking boundaries", () => {
  it("reads current live map, honors tracking off, and denies a foreign Location", async () => {
    const state = await trackedAdmin();
    const path = `/v1/staff/locations/${state.location.locationId}/live-operations-map`;

    const current = await fixture.managementGet(path, state.auth.accessToken);
    expect(current.status).toBe(200);
    expect(current.body?.items).toEqual([
      expect.objectContaining({ trackingSessionId: state.trackingSessionId }),
    ]);

    await fixture.query(
      `UPDATE locations SET tracking_enabled_override = false,
              updated_at = transaction_timestamp() WHERE id = $1`,
      [state.location.locationId],
    );
    const disabled = await fixture.managementGet(path, state.auth.accessToken);
    expect(disabled.status).toBe(200);
    expect(disabled.body).toMatchObject({ items: [], nextCursor: null });

    const foreignOrganizationId = await fixture.createOrganization({
      name: "Foreign tracking org",
    });
    const foreign = await fixture.addLocation(foreignOrganizationId);
    const denied = await fixture.managementGet(
      `/v1/staff/locations/${foreign.locationId}/live-operations-map`,
      state.auth.accessToken,
    );
    expect(denied.status).toBe(404);
    expect(denied.body).toMatchObject({ code: "AUTHORIZATION_DENIED" });
  });

  it("keeps retained raw route history denied after valid MFA assurance", async () => {
    const state = await trackedAdmin();
    await fixture.query(
      `UPDATE task_tracking_sessions SET ended_at = transaction_timestamp()
       WHERE id = $1`,
      [state.trackingSessionId],
    );
    const raw = await fixture.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM raw_gps_samples
       WHERE tracking_session_id = $1`,
      [state.trackingSessionId],
    );
    expect(raw.rows[0]?.count).toBe("1");

    const denied = await fixture.managementGet(
      `/v1/staff/tracking-sessions/${state.trackingSessionId}/route-history`,
      state.auth.accessToken,
    );
    expect(denied.status).toBe(404);
    expect(denied.body).toMatchObject({ code: "AUTHORIZATION_DENIED" });
  });

  it("keeps map-setup mutation denied after valid MFA assurance", async () => {
    const state = await trackedAdmin();
    const denied = await fixture.request(
      `/v1/staff/locations/${state.location.locationId}/map/points`,
      {
        authorization: `Bearer ${state.auth.accessToken}`,
        body: {
          active: true,
          code: "ADMIN_DENIED",
          kind: "ENTRANCE",
          label: "Admin denied",
          latitude: 31.9539,
          levelLabel: null,
          longitude: 35.9106,
        },
      },
    );
    expect(denied.status).toBe(404);
    expect(denied.body).toMatchObject({ code: "AUTHORIZATION_DENIED" });
    const points = await fixture.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM location_map_points
       WHERE location_id = $1`,
      [state.location.locationId],
    );
    expect(points.rows[0]?.count).toBe("0");
  });
});
