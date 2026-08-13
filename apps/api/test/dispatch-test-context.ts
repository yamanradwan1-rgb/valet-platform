import { randomUUID } from "node:crypto";

import { expect } from "vitest";

import { createQueueParkingTaskCommandExecutor } from "../src/modules/dispatch/queue-parking-task-command";
import { createStartShiftCommandExecutor } from "../src/modules/shifts/start-shift-command";
import {
  ShiftTestContext,
  type ShiftFixture,
  type ShiftFixtureOptions,
  type TestRole,
} from "./shift-test-context";

export interface DispatchFixture extends ShiftFixture {
  readonly sessionId: string;
}

export interface DispatchMember {
  readonly membershipId: string;
  readonly userId: string;
}

export interface RetrievalTaskFixture {
  readonly retrievalRequestId: string;
  readonly taskId: string;
}

export class DispatchTestContext extends ShiftTestContext {
  constructor(label: string) {
    super(`005e_${label}`);
  }

  async createDispatchFixture(
    options: ShiftFixtureOptions & {
      readonly sessionState?: string;
      readonly startShift?: boolean;
    } = {},
  ): Promise<DispatchFixture> {
    const fixture = await this.createFixture(options);
    if (options.startShift !== false) await this.startShift(fixture);
    return {
      ...fixture,
      sessionId: await this.addSession(
        fixture,
        options.sessionState ?? "AWAITING_PARKING",
      ),
    };
  }

  async startShift(fixture: ShiftFixture): Promise<string> {
    const shift = await createStartShiftCommandExecutor(this.runtimePool)({
      authenticatedUserId: fixture.userId,
      targetLocationId: fixture.locationId,
    });
    return shift.shiftId;
  }

  async addMember(
    fixture: ShiftFixture,
    role: TestRole = "VALET_EMPLOYEE",
    startShift = true,
  ): Promise<DispatchMember> {
    const member = { membershipId: randomUUID(), userId: randomUUID() };
    const identity = randomUUID();
    await this.adminPool.query(
      `INSERT INTO users (id, email, password_hash, status, updated_at)
       VALUES ($1, $2, 'not-real', 'ACTIVE', transaction_timestamp())`,
      [member.userId, `${identity}@val-005e.test`],
    );
    await this.adminPool.query(
      `INSERT INTO organization_memberships
         (id, organization_id, user_id, role, status, updated_at)
       VALUES ($1, $2, $3, $4, 'ACTIVE', transaction_timestamp())`,
      [member.membershipId, fixture.organizationId, member.userId, role],
    );
    await this.adminPool.query(
      `INSERT INTO membership_location_access
         (organization_id, membership_id, location_id)
       VALUES ($1, $2, $3)`,
      [fixture.organizationId, member.membershipId, fixture.locationId],
    );
    if (startShift) {
      await this.startShift({
        ...fixture,
        membershipId: member.membershipId,
        userId: member.userId,
      });
    }
    return member;
  }

  async addSession(fixture: ShiftFixture, state = "AWAITING_PARKING") {
    const vehicleId = randomUUID();
    const sessionId = randomUUID();
    const identity = randomUUID();
    await this.adminPool.query(
      `INSERT INTO vehicles
         (id, organization_id, temporary_descriptor, updated_at)
       VALUES ($1, $2, $3, transaction_timestamp())`,
      [vehicleId, fixture.organizationId, `Dispatch ${identity}`],
    );
    await this.adminPool.query(
      `INSERT INTO valet_sessions
         (id, customer_access_token_hash, customer_access_expires_at,
          organization_id, location_id, vehicle_id, state,
          checked_in_by_membership_id, version, updated_at)
       VALUES ($1, $2, transaction_timestamp() + interval '1 hour',
               $3, $4, $5, $6, $7, 1, transaction_timestamp())`,
      [
        sessionId,
        `disabled:${identity}`,
        fixture.organizationId,
        fixture.locationId,
        vehicleId,
        state,
        fixture.membershipId,
      ],
    );
    return sessionId;
  }

  async queue(fixture: DispatchFixture) {
    return createQueueParkingTaskCommandExecutor(this.runtimePool)({
      authenticatedUserId: fixture.userId,
      sessionId: fixture.sessionId,
    });
  }

  async createRetrievalTask(
    fixture: DispatchFixture,
  ): Promise<RetrievalTaskFixture> {
    const retrievalRequestId = randomUUID();
    const taskId = randomUUID();
    await this.adminPool.query(
      `INSERT INTO retrieval_requests
         (id, organization_id, valet_session_id, requested_by_type,
          requested_by_membership_id, status, requested_at)
       VALUES ($1, $2, $3, 'STAFF', $4, 'OPEN', transaction_timestamp())`,
      [
        retrievalRequestId,
        fixture.organizationId,
        fixture.sessionId,
        fixture.membershipId,
      ],
    );
    await this.adminPool.query(
      `INSERT INTO tasks
         (id, organization_id, location_id, valet_session_id, task_type,
          status, version, updated_at)
       VALUES ($1, $2, $3, $4, 'RETRIEVAL', 'QUEUED', 1,
               transaction_timestamp())`,
      [taskId, fixture.organizationId, fixture.locationId, fixture.sessionId],
    );
    await this.adminPool.query(
      `INSERT INTO dispatch_events
         (id, organization_id, location_id, task_id, valet_session_id,
          event_type, actor_membership_id, occurred_at)
       VALUES ($1, $2, $3, $4, $5, 'QUEUED', NULL,
               transaction_timestamp())`,
      [
        randomUUID(),
        fixture.organizationId,
        fixture.locationId,
        taskId,
        fixture.sessionId,
      ],
    );
    return { retrievalRequestId, taskId };
  }

  async dispatchEvents(taskId: string) {
    const result = await this.adminPool.query<{
      actor_membership_id: string | null;
      event_type: string;
      new_assignee_membership_id: string | null;
      previous_assignee_membership_id: string | null;
      reason: string | null;
    }>(
      `SELECT event_type::text, actor_membership_id::text,
              previous_assignee_membership_id::text,
              new_assignee_membership_id::text, reason
       FROM dispatch_events WHERE task_id = $1 ORDER BY occurred_at, created_at`,
      [taskId],
    );
    return result.rows;
  }

  async taskAuditEvents(taskId: string) {
    const result = await this.adminPool.query<{
      event_type: string;
      metadata_json: Record<string, unknown>;
    }>(
      `SELECT event_type, metadata_json FROM audit_events
       WHERE entity_type = 'Task' AND entity_id = $1 ORDER BY occurred_at, id`,
      [taskId],
    );
    return result.rows;
  }
}

export async function expectDispatchError(
  operation: Promise<unknown>,
  code: string,
): Promise<void> {
  await expect(operation).rejects.toMatchObject({ code });
}
