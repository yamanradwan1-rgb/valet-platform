import type { ManagementLocationLifecycleCommand } from "@valet/contracts";
import type { PostgresTransaction } from "../../common/database/postgres";
import {
  presenceCompanyPolicy,
  presenceLocationPolicy,
} from "./presence-management-projection";
import { requirePresenceResultReady } from "./presence-management-policy-command";
import { activateLocation } from "./management-location-repository";

export async function requirePresenceCompanyCreationReady(
  transaction: PostgresTransaction,
  organizationId: string,
) {
  requirePresenceResultReady(
    await presenceCompanyPolicy(transaction, organizationId),
    false,
  );
}

export async function activatePresenceReadyLocation(
  transaction: PostgresTransaction,
  actor: string,
  organization: string,
  location: string,
  input: ManagementLocationLifecycleCommand,
) {
  const presence = await presenceLocationPolicy(
    transaction,
    organization,
    location,
  );
  requirePresenceResultReady(
    presence.effective,
    presence.readiness.configurationUsable,
  );
  return activateLocation(transaction, actor, organization, location, input);
}
