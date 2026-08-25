import { randomUUID } from "node:crypto";

import { expect } from "vitest";

import { createAcceptTaskCommandExecutor } from "../src/modules/dispatch/accept-task-command";
import { createAssignTaskCommandExecutor } from "../src/modules/dispatch/assign-task-command";
import { createAssignKeySlotCommandExecutor } from "../src/modules/keys/assign-key-slot-command";
import type { ConfirmParkedCommandOptions } from "../src/modules/parking/confirm-parked-command";
import { createConfirmParkedCommandExecutor } from "../src/modules/parking/confirm-parked-command";
import {
  StartParkingTestContext,
  type StartParkingFixture,
} from "./start-parking-test-context";
import type { ShiftFixtureOptions } from "./shift-test-context";

export interface ConfirmParkedFixture extends StartParkingFixture {
  readonly parkingSpotCode: string;
  readonly parkingSpotId: string;
  readonly parkingZoneId: string;
}

export class ConfirmParkedTestContext extends StartParkingTestContext {
  constructor(label: string) {
    super(label);
  }

  async addParkingResource(
    fixture: StartParkingFixture,
    options: {
      readonly spotStatus?: "ACTIVE" | "INACTIVE";
      readonly withZone?: boolean;
      readonly zoneStatus?: "ACTIVE" | "INACTIVE";
    } = {},
  ) {
    const zone = { code: `Zone-${randomUUID()}`, id: randomUUID() };
    await this.adminPool.query(
      `INSERT INTO parking_zones
         (id, organization_id, location_id, code, label, status, updated_at)
       VALUES ($1, $2, $3, $4, 'Confirm zone', $5, transaction_timestamp())`,
      [
        zone.id,
        fixture.organizationId,
        fixture.locationId,
        zone.code,
        options.zoneStatus ?? "ACTIVE",
      ],
    );
    const spot = { code: `Spot-${randomUUID()}`, id: randomUUID() };
    await this.adminPool.query(
      `INSERT INTO parking_spots
         (id, organization_id, location_id, parking_zone_id, code, label,
          status, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'Confirm spot', $6,
               transaction_timestamp())`,
      [
        spot.id,
        fixture.organizationId,
        fixture.locationId,
        options.withZone === false ? null : zone.id,
        spot.code,
        options.spotStatus ?? "ACTIVE",
      ],
    );
    return { spot, zone };
  }

  async createConfirmParkedFixture(
    options: ShiftFixtureOptions & {
      readonly assignKey?: boolean;
      readonly spotStatus?: "ACTIVE" | "INACTIVE";
      readonly withZone?: boolean;
      readonly zoneStatus?: "ACTIVE" | "INACTIVE";
    } = {},
  ): Promise<ConfirmParkedFixture> {
    const fixture = await this.createStartParkingFixture(options);
    await this.start(fixture);
    const resource = await this.addParkingResource(fixture, options);
    return {
      ...fixture,
      parkingSpotCode: resource.spot.code,
      parkingSpotId: resource.spot.id,
      parkingZoneId: resource.zone.id,
    };
  }

  async createCompetingFixture(
    base: ConfirmParkedFixture,
  ): Promise<ConfirmParkedFixture> {
    const sessionId = await this.addSession(base);
    const fixture = { ...base, sessionId };
    const slot = await this.addKeySlot(fixture);
    await createAssignKeySlotCommandExecutor(this.runtimePool)({
      authenticatedUserId: fixture.userId,
      expectedVersion: 1,
      keySlotCode: slot.code,
      sessionId,
    });
    const queued = await this.queue(fixture);
    const assigned = await createAssignTaskCommandExecutor(this.runtimePool)({
      authenticatedUserId: fixture.userId,
      expectedVersion: queued.version,
      taskId: queued.taskId,
    });
    await createAcceptTaskCommandExecutor(this.runtimePool)({
      authenticatedUserId: fixture.userId,
      expectedVersion: assigned.version,
      taskId: assigned.taskId,
    });
    await this.start({
      ...fixture,
      keySlotCode: slot.code,
      keySlotId: slot.id,
      taskId: queued.taskId,
    });
    return {
      ...fixture,
      keySlotCode: slot.code,
      keySlotId: slot.id,
      taskId: queued.taskId,
    };
  }

  confirm(
    fixture: ConfirmParkedFixture,
    input: {
      readonly code?: string;
      readonly keySlotCode?: string;
      readonly sessionVersion?: number;
      readonly taskVersion?: number;
    } = {},
    options: ConfirmParkedCommandOptions = {},
  ) {
    return createConfirmParkedCommandExecutor(
      this.runtimePool,
      options,
    )({
      authenticatedUserId: fixture.userId,
      expectedSessionVersion: input.sessionVersion ?? 3,
      expectedTaskVersion: input.taskVersion ?? 4,
      keySlotCode: input.keySlotCode ?? fixture.keySlotCode,
      parkingSpotCode: input.code ?? fixture.parkingSpotCode,
      sessionId: fixture.sessionId,
    });
  }

  async completionEffects(fixture: ConfirmParkedFixture) {
    const projection = await this.adminPool.query(
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
       WHERE valet_session_id = $1 AND event_type = 'RETURNED_TO_SLOT'
       UNION ALL SELECT event_type::text, occurred_at FROM dispatch_events
       WHERE task_id = $2 AND event_type = 'COMPLETED'
       UNION ALL SELECT event_type, occurred_at FROM audit_events
       WHERE valet_session_id = $1 AND event_type = 'VALET_SESSION_PARKED'`,
      [fixture.sessionId, fixture.taskId],
    );
    return {
      events: events.rows,
      projection: projection.rows[0] as Record<string, unknown>,
    };
  }
}

export async function expectConfirmError(
  operation: Promise<unknown>,
  code: string,
) {
  await expect(operation).rejects.toMatchObject({ code });
}
