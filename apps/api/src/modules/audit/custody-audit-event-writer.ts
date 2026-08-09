import { randomUUID } from "node:crypto";

import type { PostgresTransaction } from "../../common/database/postgres";

export type SafeAuditMetadataValue = boolean | number | string | null;
export type SafeAuditMetadata = Readonly<
  Record<string, SafeAuditMetadataValue>
>;

export interface CustodyAuditEventDefinition {
  readonly eventType: string;
  readonly metadata: SafeAuditMetadata;
}

export interface PersistedCustodyAuditScope {
  readonly actorMembershipId: string;
  readonly locationId: string;
  readonly organizationId: string;
  readonly valetSessionId: string;
}

export class UnsafeCustodyAuditDefinitionError extends Error {
  readonly code = "UNSAFE_AUDIT_METADATA" as const;

  constructor() {
    super("Audit metadata contains a prohibited field.");
    this.name = "UnsafeCustodyAuditDefinitionError";
  }
}

const prohibitedAuditKeyPattern =
  /(authorization|bearer|credential|cvv|otp|pan|password|pickup.?code|secret|token)/i;

function validateAuditDefinition(
  definition: CustodyAuditEventDefinition,
): void {
  if (definition.eventType.trim() === "") {
    throw new UnsafeCustodyAuditDefinitionError();
  }

  // This key check is defense-in-depth. Explicit commands remain responsible
  // for defining narrow, allowlisted metadata fields and safe values.
  for (const key of Object.keys(definition.metadata)) {
    if (prohibitedAuditKeyPattern.test(key)) {
      throw new UnsafeCustodyAuditDefinitionError();
    }
  }
}

export async function appendCustodyAuditEvent(
  transaction: PostgresTransaction,
  input: {
    readonly definition: CustodyAuditEventDefinition;
    readonly occurredAt: Date;
    readonly scope: PersistedCustodyAuditScope;
  },
  auditEventIdFactory: () => string = randomUUID,
): Promise<string> {
  validateAuditDefinition(input.definition);

  const auditEventId = auditEventIdFactory();
  await transaction.query(
    `INSERT INTO audit_events
       (id, organization_id, location_id, valet_session_id,
        actor_membership_id, event_type, entity_type, entity_id,
        metadata_json, occurred_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'ValetSession', $4, $7::jsonb, $8)`,
    [
      auditEventId,
      input.scope.organizationId,
      input.scope.locationId,
      input.scope.valetSessionId,
      input.scope.actorMembershipId,
      input.definition.eventType,
      JSON.stringify(input.definition.metadata),
      input.occurredAt,
    ],
  );

  return auditEventId;
}
