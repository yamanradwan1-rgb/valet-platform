import { randomUUID } from "node:crypto";

import type { PostgresTransaction } from "../../common/database/postgres";

export type KeyAuditEventType =
  | "VALET_SESSION_KEY_SLOT_ASSIGNED"
  | "VALET_SESSION_KEY_SLOT_CLEARED"
  | "VALET_SESSION_KEY_SLOT_REASSIGNED";

export async function appendKeyAuditEvent(
  transaction: PostgresTransaction,
  input: {
    readonly actorMembershipId: string;
    readonly currentKeySlotId: string | null;
    readonly eventType: KeyAuditEventType;
    readonly fromVersion: number;
    readonly locationId: string;
    readonly occurredAt: Date;
    readonly organizationId: string;
    readonly previousKeySlotId: string | null;
    readonly sessionId: string;
    readonly toVersion: number;
  },
  auditEventIdFactory: () => string = randomUUID,
): Promise<string> {
  const auditEventId = auditEventIdFactory();
  const metadata = {
    currentKeySlotId: input.currentKeySlotId,
    fromVersion: input.fromVersion,
    previousKeySlotId: input.previousKeySlotId,
    toVersion: input.toVersion,
  };
  await transaction.query(
    `INSERT INTO audit_events
       (id, organization_id, location_id, valet_session_id,
        actor_membership_id, event_type, entity_type, entity_id,
        metadata_json, occurred_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'VALET_SESSION', $4, $7::jsonb, $8)`,
    [
      auditEventId,
      input.organizationId,
      input.locationId,
      input.sessionId,
      input.actorMembershipId,
      input.eventType,
      JSON.stringify(metadata),
      input.occurredAt,
    ],
  );
  return auditEventId;
}
