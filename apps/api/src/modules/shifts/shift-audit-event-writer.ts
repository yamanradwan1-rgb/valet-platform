import { randomUUID } from "node:crypto";

import type { PostgresTransaction } from "../../common/database/postgres";
import type { ShiftCashReconciliation } from "./shift-types";

export type ShiftAuditEventType = "SHIFT_ENDED" | "SHIFT_STARTED";

export async function appendShiftAuditEvent(
  transaction: PostgresTransaction,
  input: {
    readonly eventType: ShiftAuditEventType;
    readonly cashReconciliation?: ShiftCashReconciliation;
    readonly locationId: string;
    readonly membershipId: string;
    readonly occurredAt: Date;
    readonly organizationId: string;
    readonly shiftId: string;
  },
  auditEventIdFactory: () => string = randomUUID,
): Promise<string> {
  const auditEventId = auditEventIdFactory();
  const metadata =
    input.eventType === "SHIFT_STARTED"
      ? { status: "ACTIVE" }
      : {
          cash_expected: input.cashReconciliation?.cashExpected,
          cash_reported: input.cashReconciliation?.cashReported,
          cash_variance: input.cashReconciliation?.cashVariance,
          currency: input.cashReconciliation?.currency,
          fromStatus: "ACTIVE",
          toStatus: "ENDED",
        };
  await transaction.query(
    `INSERT INTO audit_events
       (id, organization_id, location_id, valet_session_id,
        actor_membership_id, event_type, entity_type, entity_id,
        metadata_json, occurred_at)
     VALUES ($1, $2, $3, NULL, $4, $5, 'Shift', $6, $7::jsonb, $8)`,
    [
      auditEventId,
      input.organizationId,
      input.locationId,
      input.membershipId,
      input.eventType,
      input.shiftId,
      JSON.stringify(metadata),
      input.occurredAt,
    ],
  );
  return auditEventId;
}
