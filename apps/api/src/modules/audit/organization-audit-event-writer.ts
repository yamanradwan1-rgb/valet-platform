import { randomUUID } from "node:crypto";

import type { PostgresTransaction } from "../../common/database/postgres";
import type {
  SafeAuditMetadata,
  SafeAuditMetadataValue,
} from "./custody-audit-event-writer";
import { assertOpaqueOperatorReference } from "./actor-operator-reference";

type OrganizationAuditActor =
  | { readonly type: "MEMBERSHIP"; readonly membershipId: string }
  | { readonly type: "CONTROLLED_OPERATOR"; readonly operatorRef: string }
  | { readonly type: "GUEST" | "PROVIDER" | "SYSTEM" };

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
  const allowed = new Set(allowedKeys);
  if (
    keys.length > 16 ||
    keys.some((key) => !allowed.has(key) || prohibitedKey.test(key))
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
  if (input.actor.type === "CONTROLLED_OPERATOR") {
    assertOpaqueOperatorReference(input.actor.operatorRef);
  }
  assertSafeProjection(
    input.eventType,
    input.entityType,
    input.idempotencyKey,
    input.metadata,
    input.allowedMetadataKeys,
  );
  const auditEventId = input.eventId ?? auditEventIdFactory();
  await transaction.query(
    `SELECT pg_advisory_xact_lock(
       hashtextextended('tenant-audit-event:' || $1::uuid::text, 0)
     )`,
    [auditEventId],
  );
  const inserted = await transaction.query<{ id: string }>(
    `INSERT INTO audit_events
       (id, organization_id, location_id, valet_session_id,
        actor_membership_id, actor_type, actor_operator_ref, event_type,
        entity_type, entity_id, metadata_json, idempotency_key, occurred_at)
     VALUES ($1, $2, NULL, NULL, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11)
     ON CONFLICT (id) DO NOTHING
     RETURNING id::text`,
    [
      auditEventId,
      input.organizationId,
      input.actor.type === "MEMBERSHIP" ? input.actor.membershipId : null,
      input.actor.type,
      input.actor.type === "CONTROLLED_OPERATOR"
        ? input.actor.operatorRef
        : null,
      input.eventType,
      input.entityType,
      input.entityId,
      JSON.stringify(input.metadata),
      input.idempotencyKey ?? null,
      input.occurredAt,
    ],
  );
  if (inserted.rowCount === 1) return auditEventId;

  const existing = await transaction.query<{ id: string }>(
    `SELECT existing.id::text
     FROM audit_events AS existing
     WHERE existing.id = $1::uuid
       AND existing.organization_id = $2::uuid
       AND existing.location_id IS NULL
       AND existing.valet_session_id IS NULL
       AND existing.actor_membership_id IS NOT DISTINCT FROM $3::uuid
       AND existing.actor_type IS NOT DISTINCT FROM $4::tenant_audit_actor_type
       AND existing.actor_operator_ref IS NOT DISTINCT FROM $5::text
       AND existing.event_type = $6
       AND existing.entity_type = $7
       AND existing.entity_id = $8::uuid
       AND existing.metadata_json = $9::jsonb
       AND existing.idempotency_key IS NOT DISTINCT FROM $10::text
       AND existing.occurred_at = $11::timestamptz
     LIMIT 1`,
    [
      auditEventId,
      input.organizationId,
      input.actor.type === "MEMBERSHIP" ? input.actor.membershipId : null,
      input.actor.type,
      input.actor.type === "CONTROLLED_OPERATOR"
        ? input.actor.operatorRef
        : null,
      input.eventType,
      input.entityType,
      input.entityId,
      JSON.stringify(input.metadata),
      input.idempotencyKey ?? null,
      input.occurredAt,
    ],
  );
  if (existing.rowCount !== 1) {
    throw new Error("Conflicting Organization audit event identity.");
  }
  return auditEventId;
}
