import type { PostgresTransaction } from "../../common/database/postgres";
import {
  GuestAccessError,
  hashGuestAccessToken,
  type GuestSafeSession,
} from "../valet-sessions/guest-access-command";

interface GuestSafeSessionRow {
  readonly color: string | null;
  readonly make: string | null;
  readonly model: string | null;
  readonly state: GuestSafeSession["state"];
  readonly valet_session_id: string;
}

export async function resolveGuestAccessForUpdateWithDatabase(
  transaction: PostgresTransaction,
  rawToken: string,
): Promise<GuestSafeSession> {
  const result = await transaction.query<GuestSafeSessionRow>(
    `SELECT session.id::text AS valet_session_id, session.state::text,
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
    state: session.state,
    valetSessionId: session.valet_session_id,
    vehicle: {
      color: session.color,
      make: session.make,
      model: session.model,
    },
  };
}
