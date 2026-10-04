import type { PostgresTransaction } from "../../common/database/postgres";
import type { PresenceManagementActor } from "./presence-management-authority";
import { PresenceManagementError } from "./presence-management-errors";

export type PresenceManagementKind =
  "COMPANY_POLICY" | "LOCATION_POLICY" | "ZONE" | "EXCEPTION";
export interface PresenceMutationIdentity {
  readonly mutationId: string;
  readonly entityId: string;
  readonly kind: PresenceManagementKind;
}

/** Successful identities are single-use, including no-ops. Never replay a command. */
export async function recordPresenceManagementMutation<T>(
  tx: PostgresTransaction,
  actor: PresenceManagementActor,
  identity: PresenceMutationIdentity,
  operation: () => Promise<T>,
): Promise<T> {
  const previous = await tx.query(
    `SELECT mutation_id FROM shift_presence_management_results WHERE mutation_id=$1
     UNION ALL SELECT id FROM audit_events WHERE id=$1`,
    [identity.mutationId],
  );
  if (previous.rowCount !== 0)
    throw new PresenceManagementError("PRESENCE_MUTATION_CONFLICT");
  const result = await operation();
  const audit = await tx.query<{ revision: number }>(
    `SELECT (metadata_json->>'revision')::integer AS revision FROM audit_events
     WHERE id=$1 AND organization_id=$2 AND location_id IS NOT DISTINCT FROM $3::uuid
       AND actor_membership_id=$4 AND entity_id=$5`,
    [
      identity.mutationId,
      actor.organizationId,
      actor.locationId,
      actor.membershipId,
      identity.entityId,
    ],
  );
  let revision = audit.rows[0]?.revision;
  if (revision === undefined) {
    if (
      identity.kind !== "COMPANY_POLICY" &&
      identity.kind !== "LOCATION_POLICY"
    )
      throw new Error("Presence mutation lacks its required change audit.");
    const policy = await tx.query<{ revision: number }>(
      identity.kind === "COMPANY_POLICY"
        ? `SELECT shift_presence_revision AS revision FROM organizations WHERE id=$1`
        : `SELECT shift_presence_revision AS revision FROM locations WHERE id=$1 AND organization_id=$2`,
      [
        identity.entityId,
        ...(identity.kind === "LOCATION_POLICY" ? [actor.organizationId] : []),
      ],
    );
    revision = policy.rows[0]!.revision;
  }
  // Unique identity also serializes cross-Organization collisions. A losing INSERT
  // rolls back its entire protected effect/audit through the caller transaction.
  await tx.query(
    `INSERT INTO shift_presence_management_results
     (mutation_id,organization_id,location_id,actor_membership_id,actor_user_id,kind,entity_id,revision,effect,audit_event_id)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      identity.mutationId,
      actor.organizationId,
      actor.locationId,
      actor.membershipId,
      actor.userId,
      identity.kind,
      identity.entityId,
      revision,
      audit.rows[0] === undefined ? "NO_CHANGE" : "CHANGED",
      audit.rows[0] === undefined ? null : identity.mutationId,
    ],
  );
  return result;
}

export async function readPresenceMutationProof(
  tx: PostgresTransaction,
  actor: PresenceManagementActor,
  identity: PresenceMutationIdentity,
) {
  const result = await tx.query<{
    entity_id: string;
    revision: number;
    effect: "CHANGED" | "NO_CHANGE";
  }>(
    `SELECT entity_id::text,revision,effect::text FROM shift_presence_management_results
     WHERE mutation_id=$1 AND organization_id=$2 AND location_id IS NOT DISTINCT FROM $3::uuid
       AND actor_membership_id=$4 AND actor_user_id=$5 AND entity_id=$6 AND kind=$7
     UNION ALL
     SELECT a.entity_id::text,(a.metadata_json->>'revision')::integer,'CHANGED' FROM audit_events a
     WHERE a.id=$1 AND a.organization_id=$2 AND a.location_id IS NOT DISTINCT FROM $3::uuid
       AND a.actor_membership_id=$4 AND a.entity_id=$6 AND a.entity_type=$8
       AND a.event_type=ANY($9::text[]) LIMIT 1`,
    [
      identity.mutationId,
      actor.organizationId,
      actor.locationId,
      actor.membershipId,
      actor.userId,
      identity.entityId,
      identity.kind,
      {
        COMPANY_POLICY: "Organization",
        LOCATION_POLICY: "Location",
        ZONE: "ShiftPresenceZone",
        EXCEPTION: "ShiftPresenceException",
      }[identity.kind],
      {
        COMPANY_POLICY: ["SHIFT_PRESENCE_COMPANY_POLICY_CHANGED"],
        LOCATION_POLICY: ["SHIFT_PRESENCE_LOCATION_POLICY_CHANGED"],
        ZONE: ["SHIFT_PRESENCE_ZONE_CREATED", "SHIFT_PRESENCE_ZONE_UPDATED"],
        EXCEPTION: [
          "SHIFT_PRESENCE_EXCEPTION_APPROVED",
          "SHIFT_PRESENCE_EXCEPTION_REJECTED",
        ],
      }[identity.kind],
    ],
  );
  return result.rows[0];
}
