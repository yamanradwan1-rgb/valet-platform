import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { DispatchOperationError } from "../src/modules/dispatch/dispatch-errors";
import { toStaffTaskQueueItem } from "../src/modules/dispatch/dispatch-types";
import { createStaffTaskQueueHarness } from "./staff-task-queue-harness";

const harness = createStaffTaskQueueHarness();

beforeAll(async () => {
  await harness.start();
}, 120_000);

beforeEach(() => harness.resetPrincipals());

afterAll(async () => {
  await harness.close();
}, 60_000);

describe("VUI-003A2 staff task queue projection", () => {
  it("enforces strict authorization, role, and location checks", async () => {
    const actor = await harness.fixtureWithToken("VALET_EMPLOYEE");

    // 1. Unauthenticated
    const noAuth = await harness.request(
      "GET",
      `/v1/staff/tasks/queue?locationId=${actor.fixture.locationId}`,
    );
    expect(noAuth.status).toBe(401);

    // 2. Invalid token
    const invalidToken = await harness.request(
      "GET",
      `/v1/staff/tasks/queue?locationId=${actor.fixture.locationId}`,
      { token: "invalid-token" },
    );
    expect(invalidToken.status).toBe(401);

    // 3. Inactive shift (member without active shift)
    const noShift = await harness.context.addMember(
      actor.fixture,
      "VALET_EMPLOYEE",
      false,
    );
    const noShiftToken = `no-shift-${randomUUID()}`;
    harness.principals.set(`Bearer ${noShiftToken}`, noShift.userId);
    const noShiftRes = await harness.request(
      "GET",
      `/v1/staff/tasks/queue?locationId=${actor.fixture.locationId}`,
      { token: noShiftToken },
    );
    expect(noShiftRes.status).toBe(404);

    // 4. Role restrictions (ORG_ADMIN and LOCATION_MANAGER rejected)
    const orgAdmin = await harness.context.addMember(
      actor.fixture,
      "ORG_ADMIN",
      false,
    );
    const adminToken = `admin-${randomUUID()}`;
    harness.principals.set(`Bearer ${adminToken}`, orgAdmin.userId);
    const adminRes = await harness.request(
      "GET",
      `/v1/staff/tasks/queue?locationId=${actor.fixture.locationId}`,
      { token: adminToken },
    );
    expect(adminRes.status).toBe(404);

    // 5. Cross-tenant location
    const otherTenant = await harness.context.createDispatchFixture();
    const crossTenant = await harness.request(
      "GET",
      `/v1/staff/tasks/queue?locationId=${otherTenant.locationId}`,
      { token: actor.token },
    );
    expect(crossTenant.status).toBe(404);
  });

  it("projects confirmed plate vehicle, parking context, and retrieval timing", async () => {
    const actor = await harness.fixtureWithToken("VALET_SUPERVISOR");

    // Create plate vehicle
    const vehicleId = randomUUID();
    const plateSessionId = randomUUID();
    const plateNumber = `77-${randomUUID().slice(0, 5)}`;
    await harness.context.adminPool.query(
      `INSERT INTO vehicles
         (id, organization_id, make, model, color, plate_number_raw, plate_number_normalized, plate_country, updated_at)
       VALUES ($1, $2, 'Mercedes', 'E-Class', 'Silver', $3, $4, 'JO', transaction_timestamp())`,
      [vehicleId, actor.fixture.organizationId, plateNumber, plateNumber],
    );

    // Create parking zone and spot
    const zoneId = randomUUID();
    const spotId = randomUUID();
    await harness.context.adminPool.query(
      `INSERT INTO parking_zones (id, organization_id, location_id, code, label, updated_at)
       VALUES ($1, $2, $3, 'Z1', 'Zone Alpha', transaction_timestamp())`,
      [zoneId, actor.fixture.organizationId, actor.fixture.locationId],
    );
    await harness.context.adminPool.query(
      `INSERT INTO parking_spots (id, organization_id, location_id, parking_zone_id, code, label, updated_at)
       VALUES ($1, $2, $3, $4, 'S10', 'Spot 10', transaction_timestamp())`,
      [spotId, actor.fixture.organizationId, actor.fixture.locationId, zoneId],
    );

    // Create parked session with retrieval requested
    const requestedAt = new Date("2026-08-20T10:15:30.000Z");
    await harness.context.adminPool.query(
      `INSERT INTO valet_sessions
         (id, customer_access_token_hash, customer_access_expires_at,
          organization_id, location_id, vehicle_id, state,
          parking_zone_id, parking_spot_id, retrieval_requested_at,
          checked_in_by_membership_id, version, updated_at)
       VALUES ($1, $2, transaction_timestamp() + interval '1 hour',
               $3, $4, $5, 'REQUESTED', $6, $7, $8, $9, 1, transaction_timestamp())`,
      [
        plateSessionId,
        `hash-${randomUUID()}`,
        actor.fixture.organizationId,
        actor.fixture.locationId,
        vehicleId,
        zoneId,
        spotId,
        requestedAt,
        actor.fixture.membershipId,
      ],
    );

    // Create RETRIEVAL task
    const retrievalTaskId = randomUUID();
    await harness.context.adminPool.query(
      `INSERT INTO tasks
         (id, organization_id, location_id, valet_session_id, task_type, status, version, updated_at)
       VALUES ($1, $2, $3, $4, 'RETRIEVAL', 'QUEUED', 1, transaction_timestamp())`,
      [
        retrievalTaskId,
        actor.fixture.organizationId,
        actor.fixture.locationId,
        plateSessionId,
      ],
    );

    // Also queue normal PARKING task for actor fixture
    await harness.request(
      "POST",
      `/v1/staff/valet-sessions/${actor.fixture.sessionId}/parking-task/queue`,
      { body: {}, token: actor.token },
    );

    // Read queue
    const res = await harness.request(
      "GET",
      `/v1/staff/tasks/queue?locationId=${actor.fixture.locationId}`,
      { token: actor.token },
    );
    expect(res.status).toBe(200);
    const tasks = res.body.tasks as Array<Record<string, unknown>>;
    expect(tasks.length).toBeGreaterThanOrEqual(2);

    const retrievalItem = tasks.find((t) => t.taskId === retrievalTaskId);
    expect(retrievalItem).toBeDefined();
    expect(retrievalItem).toMatchObject({
      parkingSpot: "Spot 10",
      parkingZone: "Zone Alpha",
      retrievalRequestedAt: "2026-08-20T10:15:30.000Z",
      status: "QUEUED",
      taskId: retrievalTaskId,
      taskType: "RETRIEVAL",
      vehicle: {
        color: "Silver",
        make: "Mercedes",
        model: "E-Class",
        plateNumberRaw: plateNumber,
        temporaryDescriptor: null,
      },
      version: 1,
    });

    // Verify PARKING task has null parking and null retrievalRequestedAt
    const parkingItem = tasks.find(
      (t) => t.sessionId === actor.fixture.sessionId,
    );
    expect(parkingItem).toBeDefined();
    expect(parkingItem).toMatchObject({
      parkingSpot: null,
      parkingZone: null,
      retrievalRequestedAt: null,
      status: "QUEUED",
      taskType: "PARKING",
    });

    // Zero guest PII or financial fields
    const rawJson = JSON.stringify(res.body);
    expect(rawJson).not.toMatch(
      /customer_access_token|phone|email|password|secret|payment/i,
    );
  });

  it("fails closed on unresolvable or corrupted parking assignment", () => {
    // Direct test of the mapper guard
    try {
      toStaffTaskQueueItem({
        created_at: new Date(),
        current_assignee_membership_id: null,
        id: randomUUID(),
        location_id: randomUUID(),
        organization_id: randomUUID(),
        parking_spot_label: null,
        parking_zone_label: null,
        retrieval_requested_at: null,
        session_parking_spot_id: null,
        session_parking_zone_id: randomUUID(), // zone assigned but label unresolvable
        status: "QUEUED",
        task_type: "RETRIEVAL",
        updated_at: new Date(),
        valet_session_id: randomUUID(),
        vehicle_color: "Blue",
        vehicle_make: "Ford",
        vehicle_model: "Focus",
        vehicle_plate_number_raw: "12-34567",
        vehicle_temporary_descriptor: null,
        version: 1,
      });
      expect.unreachable("Expected DispatchOperationError");
    } catch (error) {
      expect(error).toBeInstanceOf(DispatchOperationError);
      expect((error as DispatchOperationError).code).toBe(
        "TASK_NOT_FOUND_OR_FORBIDDEN",
      );
    }

    try {
      toStaffTaskQueueItem({
        created_at: new Date(),
        current_assignee_membership_id: null,
        id: randomUUID(),
        location_id: randomUUID(),
        organization_id: randomUUID(),
        parking_spot_label: null,
        parking_zone_label: "Zone A",
        retrieval_requested_at: null,
        session_parking_spot_id: randomUUID(), // spot assigned but label unresolvable
        session_parking_zone_id: randomUUID(),
        status: "QUEUED",
        task_type: "RETRIEVAL",
        updated_at: new Date(),
        valet_session_id: randomUUID(),
        vehicle_color: "Blue",
        vehicle_make: "Ford",
        vehicle_model: "Focus",
        vehicle_plate_number_raw: "12-34567",
        vehicle_temporary_descriptor: null,
        version: 1,
      });
      expect.unreachable("Expected DispatchOperationError");
    } catch (error) {
      expect(error).toBeInstanceOf(DispatchOperationError);
      expect((error as DispatchOperationError).code).toBe(
        "TASK_NOT_FOUND_OR_FORBIDDEN",
      );
    }
  });
});
