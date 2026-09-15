import { randomUUID } from "node:crypto";

import type { PostgresTransaction } from "../../common/database/postgres";
import type {
  SafeAuditMetadata,
  SafeAuditMetadataValue,
} from "./custody-audit-event-writer";

type OrganizationAuditActor =
  | { readonly type: "MEMBERSHIP"; readonly membershipId: string }
  | {
      readonly type: "CONTROLLED_OPERATOR" | "GUEST" | "PROVIDER" | "SYSTEM";
    };

const prohibitedKey =
  /(authorization|body|contact|credential|cvv|gps|header|mfa|otp|pan|password|phone|pickup.?code|secret|seed|token)/i;

function assertSafeProjection(
  eventType: string,
  entityType: string,
  idempotencyKey: string | undefined,
  metadata: SafeAuditMetadata,
  allowedKeys: readonly string[],
): void {
  if (
    !/^[A-Z][A-Z0-9_]{0,95}$/.test(eventType) ||
    !/^[A-Za-z][A-Za-z0-9_]{0,95}$/.test(entityType) ||
    (idempotencyKey !== undefined &&
      (idempotencyKey.length === 0 || idempotencyKey.length > 200 || /[\p{Cc}]/u.test(idempotencyKey)))
  ) {
    throw new Error("Organization audit identity is invalid.");
  }
  const keys = Object.keys(metadata).sort();
  const allowed = [...allowedKeys].sort();
  if (
    keys.length > 16 ||
    keys.some((key, index) => key !== allowed[index] || prohibitedKey.test(key))
  ) {
    throw new Error("Organization audit metadata violates its allowlist.");
  }
  for (const value of Object.values(metadata)) {
    if (
      (typeof value === "string" &&
        ([...value].length > 512 || /[\p{Cc}]/u.test(value))) ||
      (typeof value === "number" && !Number.isFinite(value))
    ) {
      throw new Error("Organization audit metadata value is too long.");
    }
  }
}

export interface OrganizationAuditEventInput {
  readonly actor: OrganizationAuditActor;
  readonly allowedMetadataKeys: readonly string[];
  readonly entityId: string;
  readonly entityType: string;
  readonly eventId?: string;
  readonly eventType: string;
  readonly idempotencyKey?: string;
  readonly metadata: Readonly<Record<string, SafeAuditMetadataValue>>;
  readonly occurredAt: Date;
  readonly organizationId: string;
}

export async function appendOrganizationAuditEvent(
  transaction: PostgresTransaction,
  input: OrganizationAuditEventInput,
  auditEventIdFactory: () => string = randomUUID,
): Promise<string> {
  assertSafeProjection(
    input.eventType,
    input.entityType,
    input.idempotencyKey,
    input.metadata,
    input.allowedMetadataKeys,
  );
  const auditEventId = input.eventId ?? auditEventIdFactory();
  await transaction.query(
    `INSERT INTO audit_events
       (id, organization_id, location_id, valet_session_id,
        actor_membership_id, actor_type, event_type, entity_type, entity_id,
        metadata_json, idempotency_key, occurred_at)
     VALUES ($1, $2, NULL, NULL, $3, $4, $5, $6, $7, $8::jsonb, $9, $10)
     ON CONFLICT (id) DO NOTHING`,
    [
      auditEventId,
      input.organizationId,
      input.actor.type === "MEMBERSHIP" ? input.actor.membershipId : null,
      input.actor.type,
      input.eventType,
      input.entityType,
      input.entityId,
      JSON.stringify(input.metadata),
      input.idempotencyKey ?? null,
      input.occurredAt,
    ],
  );
  return auditEventId;
}
