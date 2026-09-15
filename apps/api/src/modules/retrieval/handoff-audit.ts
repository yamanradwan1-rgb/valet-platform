import type { PostgresTransaction } from "../../common/database/postgres";
import { appendCustodyAuditEvent } from "../audit/custody-audit-event-writer";
import type { HandoffScope } from "./handoff-types";

export async function appendHandoffAudit(
  transaction: PostgresTransaction,
  input: {
    readonly actorMembershipId: string | null;
    readonly actorType?: "GUEST" | "SYSTEM";
    readonly eventType: string;
    readonly metadata: Readonly<
      Record<string, boolean | number | string | null>
    >;
    readonly occurredAt: Date;
    readonly session: HandoffScope;
  },
): Promise<void> {
  await appendCustodyAuditEvent(transaction, {
    definition: { eventType: input.eventType, metadata: input.metadata },
    occurredAt: input.occurredAt,
    scope: {
      actorMembershipId: input.actorMembershipId,
      ...(input.actorType === undefined ? {} : { actorType: input.actorType }),
      locationId: input.session.location_id,
      organizationId: input.session.organization_id,
      valetSessionId: input.session.id,
    },
  });
}
