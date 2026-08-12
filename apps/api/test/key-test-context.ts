import { randomUUID } from "node:crypto";

import { createStartShiftCommandExecutor } from "../src/modules/shifts/start-shift-command";
import {
  ShiftTestContext,
  type ShiftFixture,
  type ShiftFixtureOptions,
} from "./shift-test-context";

export interface KeyFixture extends ShiftFixture {
  readonly sessionId: string;
  readonly slotCode: string;
  readonly slotId: string;
}

export interface KeyFixtureOptions extends ShiftFixtureOptions {
  readonly sessionState?: string;
  readonly startShift?: boolean;
}

export class KeyTestContext extends ShiftTestContext {
  constructor(label: string) {
    super(`005c_${label}`);
  }

  async createKeyFixture(options: KeyFixtureOptions = {}): Promise<KeyFixture> {
    const fixture = await this.createFixture(options);
    if (options.startShift !== false) {
      await createStartShiftCommandExecutor(this.runtimePool)({
        authenticatedUserId: fixture.userId,
        targetLocationId: fixture.locationId,
      });
    }
    const slot = await this.addKeySlot(fixture);
    const sessionId = await this.addSession(fixture, {
      state: options.sessionState ?? "AWAITING_PARKING",
    });
    return {
      ...fixture,
      sessionId,
      slotCode: slot.code,
      slotId: slot.id,
    };
  }

  async addKeySlot(
    fixture: Pick<ShiftFixture, "locationId" | "organizationId">,
    options: {
      readonly code?: string;
      readonly status?: "ACTIVE" | "INACTIVE";
    } = {},
  ): Promise<{ code: string; id: string }> {
    const slot = {
      code: options.code ?? `Slot-${randomUUID()}`,
      id: randomUUID(),
    };
    await this.adminPool.query(
      `INSERT INTO key_slots
         (id, organization_id, location_id, code, status, updated_at)
       VALUES ($1, $2, $3, $4, $5, transaction_timestamp())`,
      [
        slot.id,
        fixture.organizationId,
        fixture.locationId,
        slot.code,
        options.status ?? "ACTIVE",
      ],
    );
    return slot;
  }

  async addSession(
    fixture: ShiftFixture,
    options: {
      readonly keySlotId?: string | null;
      readonly state?: string;
      readonly version?: number;
    } = {},
  ): Promise<string> {
    const sessionId = randomUUID();
    const vehicleId = randomUUID();
    const identity = randomUUID();
    await this.adminPool.query(
      `INSERT INTO vehicles
         (id, organization_id, temporary_descriptor, updated_at)
       VALUES ($1, $2, $3, transaction_timestamp())`,
      [vehicleId, fixture.organizationId, `VAL-005C vehicle ${identity}`],
    );
    await this.adminPool.query(
      `INSERT INTO valet_sessions
         (id, customer_access_token_hash, customer_access_expires_at,
          organization_id, location_id, vehicle_id, state, key_slot_id,
          checked_in_by_membership_id, version, updated_at)
       VALUES ($1, $2, transaction_timestamp() + interval '1 hour',
               $3, $4, $5, $6, $7, $8, $9, transaction_timestamp())`,
      [
        sessionId,
        `disabled:test:${identity}`,
        fixture.organizationId,
        fixture.locationId,
        vehicleId,
        options.state ?? "AWAITING_PARKING",
        options.keySlotId ?? null,
        fixture.membershipId,
        options.version ?? 1,
      ],
    );
    return sessionId;
  }

  async session(sessionId: string) {
    const result = await this.adminPool.query<{
      key_slot_id: string | null;
      state: string;
      version: number;
    }>(
      `SELECT key_slot_id::text, state::text, version
       FROM valet_sessions WHERE id = $1`,
      [sessionId],
    );
    return result.rows[0];
  }

  async custodyEvents(sessionId: string) {
    const result = await this.adminPool.query<{
      actor_membership_id: string;
      event_type: string;
      id: string;
      key_slot_id: string;
      occurred_at: Date;
    }>(
      `SELECT id::text, actor_membership_id::text, event_type::text,
              key_slot_id::text, occurred_at
       FROM key_custody_events
       WHERE valet_session_id = $1
       ORDER BY occurred_at, created_at, ctid`,
      [sessionId],
    );
    return result.rows;
  }

  async keyAuditEvents(sessionId: string) {
    const result = await this.adminPool.query<{
      actor_membership_id: string;
      entity_type: string;
      event_type: string;
      id: string;
      metadata_json: Record<string, unknown>;
      occurred_at: Date;
    }>(
      `SELECT id::text, actor_membership_id::text, entity_type, event_type,
              metadata_json, occurred_at
       FROM audit_events
       WHERE valet_session_id = $1
         AND event_type LIKE 'VALET_SESSION_KEY_SLOT_%'
       ORDER BY occurred_at, id`,
      [sessionId],
    );
    return result.rows;
  }
}

export async function expectKeyError(
  operation: Promise<unknown>,
  code: string,
): Promise<void> {
  try {
    await operation;
    throw new Error(`Expected KeySlot error ${code}.`);
  } catch (error) {
    if ((error as { code?: string }).code !== code) throw error;
  }
}
