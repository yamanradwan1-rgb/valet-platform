import type { PostgresTransaction } from "../../common/database/postgres";
import { appendCustodyAuditEvent } from "../audit/custody-audit-event-writer";
import type { HandoffScope } from "./handoff-types";

type HandoffAuditInput = {
  readonly eventType: string;
  readonly metadata: Readonly<Record<string, boolean | number | string | null>>;
  readonly occurredAt: Date;
  readonly session: HandoffScope;
} & (
  | { readonly actorMembershipId: string; readonly actorType?: "MEMBERSHIP" }
  | {
      readonly actorMembershipId: null;
      readonly actorType: "GUEST" | "SYSTEM";
    }
);

export async function appendHandoffAudit(
  transaction: PostgresTransaction,
  input: HandoffAuditInput,
): Promise<void> {
  const actor =
    input.actorMembershipId === null
      ? { actorMembershipId: null, actorType: input.actorType }
      : { actorMembershipId: input.actorMembershipId };
  await appendCustodyAuditEvent(transaction, {
    definition: { eventType: input.eventType, metadata: input.metadata },
    occurredAt: input.occurredAt,
    scope: {
      ...actor,
      locationId: input.session.location_id,
      organizationId: input.session.organization_id,
      valetSessionId: input.session.id,
    },
  });
}
