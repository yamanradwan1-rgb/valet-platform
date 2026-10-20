import type {
  PhysicalResourceCustodyQuery,
  PhysicalResourceCustodyResponse,
} from "@valet/contracts";
import type { PostgresTransaction } from "../../common/database/postgres";
import type { PhysicalResourceAuthority } from "./physical-resource-authorization";
import { PhysicalResourceError } from "./physical-resource-errors";

interface CustodyRow {
  readonly eventId: string;
  readonly eventType: PhysicalResourceCustodyResponse["items"][number]["eventType"];
  readonly occurredAt: Date;
  readonly actorMembershipId: string;
  readonly actorName: string | null;
}

export async function readPhysicalResourceCustody(
  transaction: PostgresTransaction,
  authority: PhysicalResourceAuthority,
  keySlotId: string,
  query: PhysicalResourceCustodyQuery,
): Promise<PhysicalResourceCustodyResponse> {
  // A historical/inactive Key Slot remains readable to an authorized admin.
  const resource = await transaction.query<{ id: string }>(
    `SELECT id::text AS id FROM key_slots
     WHERE id = $1 AND organization_id = $2 AND location_id = $3`,
    [keySlotId, authority.organizationId, authority.locationId],
  );
  if (resource.rowCount !== 1) {
    throw new PhysicalResourceError("AUTHORIZATION_DENIED");
  }
  const result = await transaction.query<CustodyRow>(
    `SELECT event.id::text AS "eventId", event.event_type::text AS "eventType",
            event.occurred_at AS "occurredAt",
            event.actor_membership_id::text AS "actorMembershipId",
            nullif(concat_ws(' ', actor.first_name, actor.last_name),'') AS "actorName"
     FROM key_custody_events AS event
     LEFT JOIN organization_memberships AS actor
       ON actor.id = event.actor_membership_id
      AND actor.organization_id = event.organization_id
     WHERE event.organization_id = $1
       AND event.location_id = $2
       AND event.key_slot_id = $3
     ORDER BY event.occurred_at DESC, event.id DESC LIMIT $4`,
    [
      authority.organizationId,
      authority.locationId,
      keySlotId,
      query.limit + 1,
    ],
  );
  return {
    hasMore: result.rows.length > query.limit,
    items: result.rows.slice(0, query.limit).map((row) => ({
      ...row,
      occurredAt: row.occurredAt.toISOString(),
    })),
  };
}
