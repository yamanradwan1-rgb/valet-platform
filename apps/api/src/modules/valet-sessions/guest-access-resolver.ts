import type { GuestSessionReadResponse } from "@valet/contracts";
import type {
  PostgresPool,
  PostgresTransaction,
} from "../../common/database/postgres";
import { GuestAccessError, hashGuestAccessToken } from "./guest-access-token";
import {
  projectGuestSafeSession,
  type GuestSafeSessionRow,
} from "./guest-safe-session";

function assertPresentedToken(rawToken: unknown): asserts rawToken is string {
  if (typeof rawToken !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(rawToken))
    throw new GuestAccessError("GUEST_ACCESS_INVALID");
}

export function createGuestAccessResolver(
  pool: PostgresPool,
): (rawToken: string) => Promise<GuestSessionReadResponse> {
  return async (rawToken) => resolveGuestAccessWithDatabase(pool, rawToken);
}

export async function resolveGuestAccessWithDatabase(
  database: PostgresPool | PostgresTransaction,
  rawToken: string,
): Promise<GuestSessionReadResponse> {
  assertPresentedToken(rawToken);
  const tokenHash = hashGuestAccessToken(rawToken);
  const result = await database.query<
    GuestSafeSessionRow & {
      readonly brand_display_name: string;
      readonly brand_primary_color: string;
    }
  >(
    `SELECT session.id::text AS valet_session_id, session.state::text,
              session.ready_at,
              COALESCE(location.brand_display_name_override, organization.name)
                AS brand_display_name,
              COALESCE(location.brand_primary_color_override,
                       organization.brand_primary_color) AS brand_primary_color,
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
         )`,
    [tokenHash],
  );
  const session = result.rows[0];
  if (session === undefined || String(session.state) === "CANCELLED") {
    throw new GuestAccessError("GUEST_ACCESS_INVALID");
  }
  return {
    ...projectGuestSafeSession(session),
    branding: {
      displayName: session.brand_display_name,
      primaryColor: session.brand_primary_color,
    },
  };
}

export async function resolveGuestSessionById(
  database: PostgresPool | PostgresTransaction,
  valetSessionId: string,
): Promise<GuestSessionReadResponse> {
  const result = await database.query<
    GuestSafeSessionRow & {
      readonly brand_display_name: string;
      readonly brand_primary_color: string;
    }
  >(
    `SELECT session.id::text AS valet_session_id, session.state::text,
            session.ready_at,
            COALESCE(location.brand_display_name_override, organization.name)
              AS brand_display_name,
            COALESCE(location.brand_primary_color_override,
                     organization.brand_primary_color) AS brand_primary_color,
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
       WHERE session.id = $1`,
    [valetSessionId],
  );
  const session = result.rows[0];
  if (session === undefined) throw new GuestAccessError("GUEST_ACCESS_INVALID");
  return {
    ...projectGuestSafeSession(session),
    branding: {
      displayName: session.brand_display_name,
      primaryColor: session.brand_primary_color,
    },
  };
}
