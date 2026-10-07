import type { PostgresTransaction } from "../../common/database/postgres";
import { GuestAccessError, hashGuestAccessToken } from "./guest-access-token";
import {
  projectGuestSafeSession,
  type GuestSafeSession,
} from "./guest-safe-session";

export interface LockedGuestAccessSessionScope extends GuestSafeSession {
  readonly completedAt: Date | null;
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
    completed_at: Date | null;
    customer_id: string | null;
    location_id: string;
    make: string | null;
    model: string | null;
    organization_id: string;
    guest_vehicle_ready_notification_enabled: boolean;
    ready_at: Date | null;
    retrieval_requested_at: Date | null;
    state: GuestSafeSession["state"];
    valet_session_id: string;
    version: number;
  }>(
    `SELECT session.id::text AS valet_session_id, session.organization_id::text,
            session.location_id::text, session.customer_id::text,
            session.state::text, session.version, session.retrieval_requested_at,
            session.ready_at, session.completed_at,
            COALESCE(location.guest_vehicle_ready_notification_enabled_override,
                     organization.guest_vehicle_ready_notification_enabled)
              AS guest_vehicle_ready_notification_enabled,
            vehicle.make, vehicle.model, vehicle.color
       FROM valet_sessions AS session
       INNER JOIN locations AS location
         ON location.id = session.location_id
        AND location.organization_id = session.organization_id
       INNER JOIN organizations AS organization
         ON organization.id = session.organization_id
       INNER JOIN vehicles AS vehicle
         ON vehicle.organization_id = session.organization_id
        AND vehicle.id = session.vehicle_id
       WHERE session.customer_access_token_hash = $1
         AND session.state <> 'CANCELLED'
         AND session.customer_access_consumed_at IS NULL
         AND session.customer_access_revoked_at IS NULL
         AND session.customer_access_expires_at > clock_timestamp()
         AND (
           session.state <> 'COMPLETED'
           OR (
             session.completed_at IS NOT NULL
             AND session.completed_at + INTERVAL '24 hours' > clock_timestamp()
           )
         )
       FOR UPDATE OF session`,
    [hashGuestAccessToken(rawToken)],
  );
  const session = result.rows[0];
  if (session === undefined || String(session.state) === "CANCELLED")
    throw new GuestAccessError("GUEST_ACCESS_INVALID");
  return {
    completedAt: session.completed_at,
    customerId: session.customer_id,
    locationId: session.location_id,
    organizationId: session.organization_id,
    retrievalRequestedAt: session.retrieval_requested_at,
    ...projectGuestSafeSession(session),
    version: session.version,
  };
}

export async function resolveAndLockGuestSessionById(
  transaction: PostgresTransaction,
  valetSessionId: string,
): Promise<LockedGuestAccessSessionScope> {
  const result = await transaction.query<{
    color: string | null;
    completed_at: Date | null;
    customer_id: string | null;
    location_id: string;
    make: string | null;
    model: string | null;
    organization_id: string;
    guest_vehicle_ready_notification_enabled: boolean;
    ready_at: Date | null;
    retrieval_requested_at: Date | null;
    state: GuestSafeSession["state"];
    valet_session_id: string;
    version: number;
  }>(
    `SELECT session.id::text AS valet_session_id, session.organization_id::text,
            session.location_id::text, session.customer_id::text,
            session.state::text, session.version, session.retrieval_requested_at,
            session.ready_at, session.completed_at,
            COALESCE(location.guest_vehicle_ready_notification_enabled_override,
                     organization.guest_vehicle_ready_notification_enabled)
              AS guest_vehicle_ready_notification_enabled,
            vehicle.make, vehicle.model, vehicle.color
       FROM valet_sessions AS session
       INNER JOIN locations AS location
         ON location.id = session.location_id
        AND location.organization_id = session.organization_id
       INNER JOIN organizations AS organization
         ON organization.id = session.organization_id
       INNER JOIN vehicles AS vehicle
         ON vehicle.organization_id = session.organization_id
        AND vehicle.id = session.vehicle_id
       WHERE session.id = $1
       FOR UPDATE OF session`,
    [valetSessionId],
  );
  const session = result.rows[0];
  if (session === undefined) throw new GuestAccessError("GUEST_ACCESS_INVALID");
  return {
    completedAt: session.completed_at,
    customerId: session.customer_id,
    locationId: session.location_id,
    organizationId: session.organization_id,
    retrievalRequestedAt: session.retrieval_requested_at,
    ...projectGuestSafeSession(session),
    version: session.version,
  };
}
