import { randomUUID } from "node:crypto";

import { expect } from "vitest";

import { createAcceptTaskCommandExecutor } from "../src/modules/dispatch/accept-task-command";
import { createAssignTaskCommandExecutor } from "../src/modules/dispatch/assign-task-command";
import { createAssignKeySlotCommandExecutor } from "../src/modules/keys/assign-key-slot-command";
import type { StartParkingCommandOptions } from "../src/modules/parking/start-parking-command";
import { createStartParkingCommandExecutor } from "../src/modules/parking/start-parking-command";
import {
  DispatchTestContext,
  type DispatchFixture,
} from "./dispatch-test-context";
import type { ShiftFixtureOptions } from "./shift-test-context";

export interface StartParkingFixture extends DispatchFixture {
  readonly keySlotCode: string;
  readonly keySlotId: string;
  readonly taskId: string;
}

export class StartParkingTestContext extends DispatchTestContext {
  constructor(label: string) {
    super(`005f_${label}`);
  }

  async createStartParkingFixture(
    options: ShiftFixtureOptions & {
      readonly acceptTask?: boolean;
      readonly assignKey?: boolean;
      readonly sessionState?: string;
    } = {},
  ): Promise<StartParkingFixture> {
    const fixture = await this.createDispatchFixture({
      ...options,
      sessionState: options.sessionState ?? "AWAITING_PARKING",
    });
    const slot = await this.addKeySlot(fixture);
    if (options.assignKey !== false) {
      await createAssignKeySlotCommandExecutor(this.runtimePool)({
        authenticatedUserId: fixture.userId,
        expectedVersion: 1,
        keySlotCode: slot.code,
        sessionId: fixture.sessionId,
      });
    }
    const queued = await this.queue(fixture);
    const assigned = await createAssignTaskCommandExecutor(this.runtimePool)({
      authenticatedUserId: fixture.userId,
      expectedVersion: queued.version,
      taskId: queued.taskId,
    });
    if (options.acceptTask !== false) {
      await createAcceptTaskCommandExecutor(this.runtimePool)({
        authenticatedUserId: fixture.userId,
        expectedVersion: assigned.version,
        taskId: assigned.taskId,
      });
    }
    return {
      ...fixture,
      keySlotCode: slot.code,
      keySlotId: slot.id,
      taskId: queued.taskId,
    };
  }

  async addKeySlot(fixture: DispatchFixture) {
    const slot = { code: `Start-${randomUUID()}`, id: randomUUID() };
    await this.adminPool.query(
      `INSERT INTO key_slots
         (id, organization_id, location_id, code, status, updated_at)
       VALUES ($1, $2, $3, $4, 'ACTIVE', transaction_timestamp())`,
      [slot.id, fixture.organizationId, fixture.locationId, slot.code],
    );
    return slot;
  }

  start(
    fixture: StartParkingFixture,
    versions: { readonly session?: number; readonly task?: number } = {},
    options: StartParkingCommandOptions = {},
  ) {
    return createStartParkingCommandExecutor(
      this.runtimePool,
      options,
    )({
      authenticatedUserId: fixture.userId,
      expectedSessionVersion: versions.session ?? 2,
      expectedTaskVersion: versions.task ?? 3,
      sessionId: fixture.sessionId,
    });
  }

  async effects(fixture: StartParkingFixture) {
    const projection = await this.adminPool.query<{
      current_assignee_membership_id: string | null;
      key_slot_id: string | null;
      parked_at: Date | null;
      parking_spot_id: string | null;
      parking_started_at: Date | null;
      parking_zone_id: string | null;
      session_state: string;
      session_version: number;
      task_assignee: string | null;
      task_status: string;
      task_version: number;
    }>(
      `SELECT session.state::text AS session_state,
              session.version AS session_version, session.parking_started_at,
              session.parked_at, session.key_slot_id::text,
              session.parking_zone_id::text, session.parking_spot_id::text,
              session.current_assignee_membership_id::text,
              task.status::text AS task_status, task.version AS task_version,
              task.current_assignee_membership_id::text AS task_assignee
       FROM valet_sessions AS session
       INNER JOIN tasks AS task ON task.valet_session_id = session.id
       WHERE session.id = $1 AND task.id = $2`,
      [fixture.sessionId, fixture.taskId],
    );
    const events = await this.adminPool.query<{
      event_type: string;
      occurred_at: Date;
    }>(
      `SELECT event_type::text, occurred_at FROM key_custody_events
       WHERE valet_session_id = $1 AND event_type = 'CHECKED_OUT'
       UNION ALL
       SELECT event_type::text, occurred_at FROM dispatch_events
       WHERE task_id = $2 AND event_type = 'IN_PROGRESS'
       UNION ALL
       SELECT event_type, occurred_at FROM audit_events
       WHERE valet_session_id = $1
         AND event_type = 'VALET_SESSION_PARKING_STARTED'`,
      [fixture.sessionId, fixture.taskId],
    );
    return { events: events.rows, projection: projection.rows[0]! };
  }
}

export async function expectStartParkingError(
  operation: Promise<unknown>,
  code: string,
) {
  await expect(operation).rejects.toMatchObject({ code });
}
