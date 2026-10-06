import type { ShiftPresenceManagementResultQuery } from "@valet/contracts";
import type { PostgresTransaction } from "../../common/database/postgres";
import type { PresenceManagementActor } from "./presence-management-authority";
import { ManagementAccessDeniedError } from "./management-authorization";
import {
  presenceCompanyPolicy,
  presenceLocationPolicy,
} from "./presence-management-projection";
import { readPresenceZoneResult } from "./presence-management-zone-command";
import { readPresenceMutationProof } from "./presence-management-mutation";
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
            zone: await readPresenceZoneResult(tx, actor, query.entityId),
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
                      strictActivationAllowed: true as const,
                    },
                  }
                : await presenceLocationPolicy(
                    tx,
                    actor.organizationId,
                    actor.locationId,
                  ),
          };
  const fact = await readPresenceMutationProof(tx, actor, {
    mutationId,
    entityId:
      query.kind === "POLICY"
        ? (actor.locationId ?? actor.organizationId)
        : query.entityId,
    kind:
      query.kind === "POLICY"
        ? actor.locationId === null
          ? "COMPANY_POLICY"
          : "LOCATION_POLICY"
        : query.kind,
  });
  return {
    mutationId,
    attribution:
      fact === undefined ? ("UNKNOWN" as const) : ("COMMITTED" as const),
    entityId: fact?.entity_id ?? null,
    revision: fact?.revision ?? null,
    effect: fact?.effect ?? null,
    canonical,
  };
}
