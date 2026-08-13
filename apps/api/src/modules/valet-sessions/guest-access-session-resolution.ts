import type { PostgresTransaction } from "../../common/database/postgres";
import {
  GuestAccessError,
  hashGuestAccessToken,
  type GuestSafeSession,
} from "./guest-access-command";

export interface LockedGuestAccessSessionScope extends GuestSafeSession {
  readonly customerId: string | null;
  readonly locationId: string;
  readonly organizationId: string;
  readonly retrievalRequestedAt: Date | null;
  readonly version: number;
}

const rawTokenPattern = /^[A-Za-z0-9_-]{43}$/;

export async function resolveAndLockGuestAccessSession(
  transaction: PostgresTransaction,
  rawToken: string,
): Promise<LockedGuestAccessSessionScope> {
  if (!rawTokenPattern.test(rawToken)) {
    throw new GuestAccessError("GUEST_ACCESS_INVALID");
  }
  const result = await transaction.query<{
    color: string | null;
    customer_id: string | null;
    location_id: string;
    make: string | null;
    model: string | null;
    organization_id: string;
    retrieval_requested_at: Date | null;
    state: GuestSafeSession["state"];
    valet_session_id: string;
    version: number;
  }>(
    `SELECT session.id::text AS valet_session_id, session.organization_id::text,
            session.location_id::text, session.customer_id::text,
            session.state::text, session.version, session.retrieval_requested_at,
            vehicle.make, vehicle.model, vehicle.color
       FROM valet_sessions AS session
       INNER JOIN vehicles AS vehicle
         ON vehicle.organization_id = session.organization_id
        AND vehicle.id = session.vehicle_id
       WHERE session.customer_access_token_hash = $1
         AND session.customer_access_revoked_at IS NULL
         AND session.customer_access_expires_at > clock_timestamp()
       FOR UPDATE OF session`,
    [hashGuestAccessToken(rawToken)],
  );
  const session = result.rows[0];
  if (session === undefined) throw new GuestAccessError("GUEST_ACCESS_INVALID");
  return {
    customerId: session.customer_id,
    locationId: session.location_id,
    organizationId: session.organization_id,
    retrievalRequestedAt: session.retrieval_requested_at,
    state: session.state,
    valetSessionId: session.valet_session_id,
    version: session.version,
    vehicle: { color: session.color, make: session.make, model: session.model },
  };
}
