import type { HandoffStandardMethod } from "@valet/contracts";

import type { PostgresTransaction } from "../../common/database/postgres";
import { HandoffError } from "./handoff-errors";
import type { HandoffPolicy } from "./handoff-types";

export async function loadEffectiveHandoffPolicy(
  transaction: PostgresTransaction,
  organizationId: string,
  locationId: string,
): Promise<HandoffPolicy> {
  const result = await transaction.query<{ policy: HandoffPolicy }>(
    `SELECT COALESCE(location.handoff_standard_method_policy_override,
                     organization.handoff_standard_method_policy)::text AS policy
     FROM organizations AS organization
     INNER JOIN locations AS location
       ON location.organization_id = organization.id
      AND location.id = $2
     WHERE organization.id = $1
     FOR SHARE OF organization, location`,
    [organizationId, locationId],
  );
  const policy = result.rows[0]?.policy;
  if (policy === undefined) throw new Error("Handoff policy scope is missing.");
  return policy;
}

export function assertHandoffMethodAllowed(
  policy: HandoffPolicy,
  method: HandoffStandardMethod,
): void {
  if (policy !== "EITHER" && policy !== method) {
    throw new HandoffError("HANDOFF_METHOD_NOT_ALLOWED");
  }
}

export function isHandoffMethodAllowed(
  policy: HandoffPolicy,
  method: HandoffStandardMethod,
): boolean {
  return policy === "EITHER" || policy === method;
}
