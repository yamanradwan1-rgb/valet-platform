import { randomUUID } from "node:crypto";

import type { PostgresTransaction } from "../../common/database/postgres";

export type AssignmentCustodyEventType = "SLOT_ASSIGNED" | "SLOT_CLEARED";
export type ParkingCustodyEventType = "CHECKED_OUT" | "RETURNED_TO_SLOT";

export interface KeyCustodyScope {
  readonly actorMembershipId: string;
  readonly keySlotId: string;
  readonly locationId: string;
  readonly organizationId: string;
  readonly sessionId: string;
}

export async function appendKeyCustodyEvent(
  transaction: PostgresTransaction,
  input: KeyCustodyScope & {
    readonly eventType: AssignmentCustodyEventType | ParkingCustodyEventType;
    readonly occurredAt: Date;
  },
  eventIdFactory: () => string = randomUUID,
): Promise<string> {
  const eventId = eventIdFactory();
  await transaction.query(
    `INSERT INTO key_custody_events
       (id, organization_id, location_id, valet_session_id, key_slot_id,
        actor_membership_id, event_type, occurred_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      eventId,
      input.organizationId,
      input.locationId,
      input.sessionId,
      input.keySlotId,
      input.actorMembershipId,
      input.eventType,
      input.occurredAt,
    ],
  );
  return eventId;
}
