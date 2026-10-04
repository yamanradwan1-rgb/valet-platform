import type { ShiftPresenceManagementResultQuery } from "@valet/contracts";
import type { PostgresTransaction } from "../../common/database/postgres";
import type { PresenceManagementActor } from "./presence-management-authority";
import { ManagementAccessDeniedError } from "./management-authorization";
import {
  presenceCompanyPolicy,
  presenceLocationPolicy,
} from "./presence-management-projection";
import { readPresenceZone } from "./presence-management-zone-command";
import { readManagementPresenceException } from "./presence-management-exception";

export async function readPresenceManagementResult(
  tx: PostgresTransaction,
  actor: PresenceManagementActor,
  mutationId: string,
  query: ShiftPresenceManagementResultQuery,
) {
  if (query.kind !== "POLICY" && actor.locationId === null)
    throw new ManagementAccessDeniedError();
  const canonical =
    query.kind === "ZONE"
      ? {
          kind: "ZONE" as const,
          value: {
            zone: await readPresenceZone(tx, actor, query.entityId),
            readiness: (
              await presenceLocationPolicy(
                tx,
                actor.organizationId,
                actor.locationId!,
              )
            ).readiness,
          },
        }
      : query.kind === "EXCEPTION"
        ? {
            kind: "EXCEPTION" as const,
            value: await readManagementPresenceException(
              tx,
              actor,
              query.entityId,
            ),
          }
        : {
            kind: "POLICY" as const,
            value:
              actor.locationId === null
                ? {
                    organizationId: actor.organizationId,
                    policy: await presenceCompanyPolicy(
                      tx,
                      actor.organizationId,
                    ),
                    capabilities: {
                      canEdit: true,
                      strictActivationAllowed: false as const,
                    },
                  }
                : await presenceLocationPolicy(
                    tx,
                    actor.organizationId,
                    actor.locationId,
                  ),
          };
  const result = await tx.query<{
    entity_id: string;
    metadata_json: { revision?: number };
  }>(
    `SELECT a.entity_id::text,a.metadata_json FROM audit_events a
         WHERE a.id=$1 AND a.organization_id=$2 AND a.location_id IS NOT DISTINCT FROM $3::uuid
           AND a.actor_membership_id=$4 AND a.event_type IN
           ('SHIFT_PRESENCE_COMPANY_POLICY_CHANGED','SHIFT_PRESENCE_LOCATION_POLICY_CHANGED',
            'SHIFT_PRESENCE_ZONE_CREATED','SHIFT_PRESENCE_ZONE_UPDATED',
            'SHIFT_PRESENCE_EXCEPTION_APPROVED','SHIFT_PRESENCE_EXCEPTION_REJECTED')
           AND a.entity_id=$5::uuid AND a.entity_type=$6`,
    [
      mutationId,
      actor.organizationId,
      actor.locationId,
      actor.membershipId,
      query.kind === "POLICY"
        ? (actor.locationId ?? actor.organizationId)
        : query.entityId,
      query.kind === "ZONE"
        ? "ShiftPresenceZone"
        : query.kind === "EXCEPTION"
          ? "ShiftPresenceException"
          : actor.locationId === null
            ? "Organization"
            : "Location",
    ],
  );
  const fact = result.rows[0];
  return {
    mutationId,
    attribution:
      fact === undefined ? ("UNKNOWN" as const) : ("COMMITTED" as const),
    entityId: fact?.entity_id ?? null,
    revision: fact?.metadata_json.revision ?? null,
    canonical,
  };
}
