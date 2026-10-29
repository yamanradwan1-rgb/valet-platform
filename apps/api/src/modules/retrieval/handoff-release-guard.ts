import type { PostgresTransaction } from "../../common/database/postgres";
import { lockUnconsumedVerification } from "./handoff-locks";
import {
  isHandoffMethodAllowed,
  loadEffectiveHandoffPolicy,
} from "./handoff-policy";
import type { LockedHandoffSession } from "./handoff-types";

export interface ReleaseEligibleVerification {
  readonly id: string;
  readonly method: "PICKUP_CODE" | "DYNAMIC_QR" | "SUPERVISOR_OVERRIDE";
}

export async function lockReleaseEligibleHandoffVerification(
  transaction: PostgresTransaction,
  session: LockedHandoffSession,
  operationTime: Date,
  currentTaskOwnerMembershipId: string,
): Promise<ReleaseEligibleVerification | undefined> {
  if (
    session.state !== "HANDOFF_PENDING" ||
    session.handoff_pending_at === null
  ) {
    return undefined;
  }
  const verification = await lockUnconsumedVerification(transaction, session);
  if (verification?.verified_at === null || verification === undefined) {
    return undefined;
  }
  if (verification.method === "SUPERVISOR_OVERRIDE") {
    return { id: verification.id, method: verification.method };
  }
  // A fresh standard proof is always bound to the current assigned employee.
  // Historical proof remains auditable but cannot authorize B's release.
  if (
    verification.verified_by_membership_id !== currentTaskOwnerMembershipId
  ) {
    return undefined;
  }
  const policy = await loadEffectiveHandoffPolicy(
    transaction,
    session.organization_id,
    session.location_id,
  );
  if (
    verification.expires_at === null ||
    verification.expires_at.getTime() <= operationTime.getTime() ||
    !isHandoffMethodAllowed(policy, verification.method)
  ) {
    return undefined;
  }
  return { id: verification.id, method: verification.method };
}
