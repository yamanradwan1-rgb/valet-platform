import type { PostgresTransaction } from "../../common/database/postgres";
import {
  appendKeyCustodyEvent,
  type KeyCustodyScope,
  type ParkingCustodyEventType,
} from "./key-custody-event-writer";

async function recordParkingCustody(
  transaction: PostgresTransaction,
  input: KeyCustodyScope & { readonly occurredAt: Date },
  eventType: ParkingCustodyEventType,
): Promise<string> {
  const scope = await transaction.query<{ valid: boolean }>(
    `SELECT true AS valid
     FROM valet_sessions AS session
     INNER JOIN key_slots AS slot
       ON slot.organization_id = session.organization_id
      AND slot.location_id = session.location_id
      AND slot.id = session.key_slot_id
     INNER JOIN organization_memberships AS membership
       ON membership.organization_id = session.organization_id
      AND membership.id = $5
     WHERE session.id = $1
       AND session.organization_id = $2
       AND session.location_id = $3
       AND slot.id = $4
     FOR SHARE OF session, slot, membership`,
    [
      input.sessionId,
      input.organizationId,
      input.locationId,
      input.keySlotId,
      input.actorMembershipId,
    ],
  );
  if (scope.rows[0]?.valid !== true) {
    throw new Error("Key custody scope is invalid.");
  }
  return appendKeyCustodyEvent(transaction, { ...input, eventType });
}

export function recordKeyCheckedOut(
  transaction: PostgresTransaction,
  input: KeyCustodyScope & { readonly occurredAt: Date },
): Promise<string> {
  return recordParkingCustody(transaction, input, "CHECKED_OUT");
}

export function recordKeyReturnedToSlot(
  transaction: PostgresTransaction,
  input: KeyCustodyScope & { readonly occurredAt: Date },
): Promise<string> {
  return recordParkingCustody(transaction, input, "RETURNED_TO_SLOT");
}
