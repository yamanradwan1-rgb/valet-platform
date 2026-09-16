import { randomUUID } from "node:crypto";

import type { PostgresTransaction } from "../../common/database/postgres";
import { appendOrganizationAuditEvent } from "../audit/organization-audit-writer";

export function appendStaffManagementAudit(
  transaction: PostgresTransaction,
  input: {
    readonly actorMembershipId: string;
    readonly eventType: string;
    readonly membershipId: string;
    readonly metadata: Readonly<Record<string, boolean | number | string | null>>;
    readonly organizationId: string;
  },
) {
  return appendOrganizationAuditEvent(transaction, {
    actor: { membershipId: input.actorMembershipId, type: "MEMBERSHIP" },
    allowedMetadataKeys: Object.keys(input.metadata),
    entityId: input.membershipId,
    entityType: "OrganizationMembership",
    eventId: randomUUID(),
    eventType: input.eventType,
    metadata: input.metadata,
    occurredAt: new Date(),
    organizationId: input.organizationId,
  });
}
