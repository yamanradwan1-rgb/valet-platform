import type { PostgresTransaction } from "../../common/database/postgres";
import type { PresenceManagementActor } from "./presence-management-authority";

type PresenceManagementAudit =
  | {
      eventType: "SHIFT_PRESENCE_ZONE_CREATED" | "SHIFT_PRESENCE_ZONE_UPDATED";
      entityType: "ShiftPresenceZone";
      entityId: string;
      revision: number;
      state: "ACTIVE" | "DISABLED";
    }
  | {
      eventType:
        | "SHIFT_PRESENCE_EXCEPTION_APPROVED"
        | "SHIFT_PRESENCE_EXCEPTION_REJECTED";
      entityType: "ShiftPresenceException";
      entityId: string;
      revision: number;
      state: "APPROVED" | "REJECTED";
    };

/** Typed real-Location management audit; no labels, raw fixes or generic metadata. */
export async function appendPresenceManagementAudit(
  transaction: PostgresTransaction,
  actor: PresenceManagementActor,
  mutationId: string,
  fact: PresenceManagementAudit,
) {
  if (actor.locationId === null)
    throw new Error("Presence management audit requires its real Location.");
  await transaction.query(
    `INSERT INTO audit_events(id,organization_id,location_id,actor_membership_id,actor_type,
    event_type,entity_type,entity_id,metadata_json,occurred_at)
    VALUES($1,$2,$3,$4,'MEMBERSHIP',$5,$6,$7,$8::jsonb,clock_timestamp())`,
    [
      mutationId,
      actor.organizationId,
      actor.locationId,
      actor.membershipId,
      fact.eventType,
      fact.entityType,
      fact.entityId,
      JSON.stringify({ revision: fact.revision, state: fact.state }),
    ],
  );
}
