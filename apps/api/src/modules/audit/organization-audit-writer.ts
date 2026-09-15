import type { PostgresTransaction } from "../../common/database/postgres";
import {
  AuditEventIdentityConflictError,
  type OrganizationAuditActor,
  type SafeOrganizationAuditMetadata,
  requireAuditEntityType,
  requireAuditEventType,
  requireAuditUuid,
  validateOrganizationAuditMetadata,
  validateTenantAuditActor,
} from "./audit-foundation-validation";

export interface OrganizationAuditEventInput {
  readonly actor: OrganizationAuditActor;
  readonly allowedMetadataKeys: readonly string[];
  readonly entityId: string;
  readonly entityType: string;
  readonly eventId: string;
  readonly eventType: string;
  readonly metadata: SafeOrganizationAuditMetadata;
  readonly occurredAt: Date;
  readonly organizationId: string;
}

function actorColumns(actor: OrganizationAuditActor): {
  actorMembershipId: string | null;
  actorType: OrganizationAuditActor["type"];
} {
  return {
    actorMembershipId: actor.type === "MEMBERSHIP" ? actor.membershipId : null,
    actorType: actor.type,
  };
}

export async function appendOrganizationAuditEvent(
  transaction: PostgresTransaction,
  input: OrganizationAuditEventInput,
): Promise<string> {
  requireAuditUuid(input.eventId);
  requireAuditUuid(input.organizationId);
  requireAuditUuid(input.entityId);
  requireAuditEventType(input.eventType);
  requireAuditEntityType(input.entityType);
  validateTenantAuditActor(input.actor);
  validateOrganizationAuditMetadata(
    input.metadata,
    input.allowedMetadataKeys,
  );
  if (Number.isNaN(input.occurredAt.getTime())) {
    throw new Error("Audit occurrence time is invalid.");
  }

  const actor = actorColumns(input.actor);
  const metadataJson = JSON.stringify(input.metadata);
  const inserted = await transaction.query<{ id: string }>(
    `INSERT INTO audit_events (
       id, organization_id, location_id, valet_session_id,
       actor_membership_id, actor_type,
       event_type, entity_type, entity_id, metadata_json, occurred_at
     ) VALUES (
       $1, $2, NULL, NULL, $3, $4::audit_actor_type,
       $5, $6, $7, $8::jsonb, $9
     )
     ON CONFLICT (id) DO NOTHING
     RETURNING id::text AS id`,
    [
      input.eventId,
      input.organizationId,
      actor.actorMembershipId,
      actor.actorType,
      input.eventType,
      input.entityType,
      input.entityId,
      metadataJson,
      input.occurredAt,
    ],
  );
  if (inserted.rowCount === 1) return input.eventId;

  const existing = await transaction.query<{ exact_match: boolean }>(
    `SELECT organization_id = $2::uuid
            AND location_id IS NULL
            AND valet_session_id IS NULL
            AND actor_membership_id IS NOT DISTINCT FROM $3::uuid
            AND actor_type = $4::audit_actor_type
            AND controlled_operator_ref IS NULL
            AND event_type = $5
            AND entity_type = $6
            AND entity_id = $7::uuid
            AND metadata_json = $8::jsonb
            AND idempotency_key IS NULL
            AND occurred_at = $9::timestamptz AS exact_match
     FROM audit_events
     WHERE id = $1::uuid`,
    [
      input.eventId,
      input.organizationId,
      actor.actorMembershipId,
      actor.actorType,
      input.eventType,
      input.entityType,
      input.entityId,
      metadataJson,
      input.occurredAt,
    ],
  );
  if (existing.rows[0]?.exact_match === true) return input.eventId;
  throw new AuditEventIdentityConflictError();
}
