import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { StaffValetSessionDetailResponse } from "@valet/contracts";

import { createMarkReadyCommandExecutor } from "../src/modules/retrieval/mark-ready-command";
import { createStartRetrievalCommandExecutor } from "../src/modules/retrieval/start-retrieval-command";

import {
  createStaffValetSessionHarness,
  type StaffValetSessionHarness,
} from "./staff-valet-session-harness";

describe("Staff Valet Session Retrieval Lifecycle Recovery Integration", () => {
  let harness: StaffValetSessionHarness;

  beforeAll(async () => {
    harness = createStaffValetSessionHarness();
    await harness.start();
  }, 120_000);

  afterAll(async () => {
    await harness.close();
  }, 60_000);

  it("composes real Start Retrieval and Mark Ready commands with A1 recovery authorization", async () => {
    const { fixture } = await harness.fixtureWithToken();

    // Employee A owns the completed PARKING task
    const employeeA = await harness.addMember(fixture, "VALET_EMPLOYEE", true);

    // Employee B owns the ACCEPTED RETRIEVAL task
    const employeeB = await harness.addMember(fixture, "VALET_EMPLOYEE", true);
    const tokenB = `token-${randomUUID()}`;
    harness.principals.set(`Bearer ${tokenB}`, employeeB.userId);

    // Employee C is an unrelated on-shift valet employee
    const employeeC = await harness.addMember(fixture, "VALET_EMPLOYEE", true);
    const tokenC = `token-${randomUUID()}`;
    harness.principals.set(`Bearer ${tokenC}`, employeeC.userId);

    const zoneId = await harness.createParkingZone(fixture, "ZONE-LC");
    const spotId = await harness.createParkingSpot(fixture, zoneId, "LC-7");
    const slotId = await harness.createKeySlot(fixture, "K-LC");

    const { sessionId } = await harness.createSession(fixture, {
      checkInConditionCompletedAt: new Date(),
      keySlotId: slotId,
      parkedAt: new Date(),
      parkingSpotId: spotId,
      parkingStartedAt: new Date(),
      parkingZoneId: zoneId,
      state: "REQUESTED",
      version: 4,
    });

    await harness.context.adminPool.query(
      `UPDATE valet_sessions
       SET retrieval_requested_at = transaction_timestamp()
       WHERE id = $1`,
      [sessionId],
    );
    await harness.context.adminPool.query(
      `INSERT INTO retrieval_requests
         (id, organization_id, valet_session_id, requested_by_type,
          requested_by_membership_id, status, requested_at)
       VALUES ($1, $2, $3, 'STAFF', $4, 'OPEN', transaction_timestamp())`,
      [randomUUID(), fixture.organizationId, sessionId, fixture.membershipId],
    );

    await harness.createTask(fixture, sessionId, {
      assigneeMembershipId: employeeA.membershipId,
      status: "COMPLETED",
      taskType: "PARKING",
    });
    await harness.createTask(fixture, sessionId, {
      assigneeMembershipId: employeeB.membershipId,
      status: "ACCEPTED",
      taskType: "RETRIEVAL",
    });

    // STEP 1: Employee B reads the authoritative REQUESTED session
    const step1 = await harness.request<StaffValetSessionDetailResponse>(
      "GET",
      `/v1/staff/valet-sessions/${sessionId}`,
      { token: tokenB },
    );
    expect(step1.status).toBe(200);
    expect(step1.body.state).toBe("REQUESTED");
    expect(step1.body.parking.parkingSpotCode).toBe("LC-7");
    expect(step1.body.parking.parkingZoneCode).toBe("ZONE-LC");
    expect(step1.body.keySlot?.code).toBe("K-LC");

    // STEP 2: real Start Retrieval command as Employee B (no direct DB state edit)
    const started = await createStartRetrievalCommandExecutor(
      harness.context.runtimePool,
    )({
      authenticatedUserId: employeeB.userId,
      expectedSessionVersion: 4,
      expectedTaskVersion: 1,
      sessionId,
    });
    expect(started.state).toBe("RETRIEVING");
    expect(started.sessionVersion).toBe(5);
    expect(started.taskStatus).toBe("IN_PROGRESS");
    expect(started.taskVersion).toBe(2);

    const postStart = await harness.context.adminPool.query<{
      checked_out_count: number;
      parking_spot_id: string | null;
      request_status: string;
      session_state: string;
      session_version: number;
      task_assignee: string | null;
      task_status: string;
      task_version: number;
    }>(
      `SELECT session.state::text AS session_state,
              session.version AS session_version,
              session.parking_spot_id::text AS parking_spot_id,
              request.status::text AS request_status,
              task.status::text AS task_status,
              task.version AS task_version,
              task.current_assignee_membership_id::text AS task_assignee,
              (SELECT count(*)::integer FROM key_custody_events
               WHERE valet_session_id = $1 AND event_type = 'CHECKED_OUT')
                AS checked_out_count
       FROM valet_sessions AS session
       INNER JOIN tasks AS task ON task.valet_session_id = session.id
         AND task.task_type = 'RETRIEVAL'
       INNER JOIN retrieval_requests AS request
         ON request.valet_session_id = session.id
       WHERE session.id = $1`,
      [sessionId],
    );
    const startRow = postStart.rows[0]!;
    expect(startRow.session_state).toBe("RETRIEVING");
    expect(startRow.session_version).toBe(5);
    expect(startRow.parking_spot_id).toBeNull();
    expect(startRow.request_status).toBe("ACCEPTED");
    expect(startRow.task_status).toBe("IN_PROGRESS");
    expect(startRow.task_version).toBe(2);
    expect(startRow.task_assignee).toBe(employeeB.membershipId);
    expect(startRow.checked_out_count).toBe(1);

    // STEP 3: A1 recovery immediately after real Start Retrieval
    const step3 = await harness.request<StaffValetSessionDetailResponse>(
      "GET",
      `/v1/staff/valet-sessions/${sessionId}`,
      { token: tokenB },
    );
    expect(step3.status).toBe(200);
    expect(step3.body.state).toBe("RETRIEVING");
    expect(step3.body.parking.parkingSpotCode).toBeNull();
    expect(step3.body.parking.parkingZoneCode).toBeNull();
    expect(step3.body.keySlot?.code).toBe("K-LC");

    // STEP 4: unrelated Employee C stays denied after Start Retrieval
    const step4 = await harness.request(
      "GET",
      `/v1/staff/valet-sessions/${sessionId}`,
      { token: tokenC },
    );
    expect(step4.status).toBe(404);
    expect(step4.body.code).toBe("TENANT_ACCESS_DENIED");

    // STEP 5: real Mark Ready command as Employee B (no direct DB state edit)
    const ready = await createMarkReadyCommandExecutor(
      harness.context.runtimePool,
    )({
      authenticatedUserId: employeeB.userId,
      expectedSessionVersion: 5,
      sessionId,
    });
    expect(ready.state).toBe("READY");
    expect(ready.sessionVersion).toBe(6);
    expect(ready.taskStatus).toBe("IN_PROGRESS");
    expect(ready.taskVersion).toBe(2);

    const postReady = await harness.context.adminPool.query<{
      session_state: string;
      session_version: number;
      task_assignee: string | null;
      task_status: string;
      task_version: number;
    }>(
      `SELECT session.state::text AS session_state,
              session.version AS session_version,
              task.status::text AS task_status,
              task.version AS task_version,
              task.current_assignee_membership_id::text AS task_assignee
       FROM valet_sessions AS session
       INNER JOIN tasks AS task ON task.valet_session_id = session.id
         AND task.task_type = 'RETRIEVAL'
       WHERE session.id = $1`,
      [sessionId],
    );
    const readyRow = postReady.rows[0]!;
    expect(readyRow.session_state).toBe("READY");
    expect(readyRow.session_version).toBe(6);
    expect(readyRow.task_status).toBe("IN_PROGRESS");
    expect(readyRow.task_version).toBe(2);
    expect(readyRow.task_assignee).toBe(employeeB.membershipId);

    // STEP 6: A1 recovery at READY with released spot; peer still denied
    const step6 = await harness.request<StaffValetSessionDetailResponse>(
      "GET",
      `/v1/staff/valet-sessions/${sessionId}`,
      { token: tokenB },
    );
    expect(step6.status).toBe(200);
    expect(step6.body.state).toBe("READY");
    expect(step6.body.parking.parkingSpotCode).toBeNull();
    expect(step6.body.parking.parkingZoneCode).toBeNull();

    const step6C = await harness.request(
      "GET",
      `/v1/staff/valet-sessions/${sessionId}`,
      { token: tokenC },
    );
    expect(step6C.status).toBe(404);
    expect(step6C.body.code).toBe("TENANT_ACCESS_DENIED");
  });
});
