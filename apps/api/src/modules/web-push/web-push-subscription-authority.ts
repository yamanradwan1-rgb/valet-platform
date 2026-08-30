import { UnauthorizedException } from "@nestjs/common";

import type { PostgresTransaction } from "../../common/database/postgres";
import {
  GuestAccessError,
  hashGuestAccessToken,
} from "../valet-sessions/guest-access-command";
import { hashStaffCredential } from "../auth/staff-auth-credential";

const staffBearerPattern = /^Bearer (vsa1\.[A-Za-z0-9_-]{43})$/;
const guestTokenPattern = /^[A-Za-z0-9_-]{43}$/;

export interface StaffSubscriptionAuthority {
  readonly audience: "EMPLOYEE";
  readonly staffAuthSessionId: string;
  readonly userId: string;
}

export interface GuestSubscriptionAuthority {
  readonly audience: "GUEST";
  readonly guestAccessGeneration: string;
  readonly guestValetSessionId: string;
}

export type WebPushSubscriptionAuthority =
  StaffSubscriptionAuthority | GuestSubscriptionAuthority;

export async function lockStaffSubscriptionAuthority(
  transaction: PostgresTransaction,
  authorization: string,
): Promise<StaffSubscriptionAuthority> {
  const token = staffBearerPattern.exec(authorization)?.[1];
  if (token === undefined) throw new UnauthorizedException();
  const result = await transaction.query<{
    session_id: string;
    user_id: string;
  }>(
    `SELECT session.id::text AS session_id, session.user_id::text
     FROM staff_auth_sessions AS session
     INNER JOIN users AS staff_user ON staff_user.id = session.user_id
     WHERE session.current_access_token_hash = $1
       AND session.revoked_at IS NULL
       AND clock_timestamp() < session.access_expires_at
       AND clock_timestamp() < session.absolute_expires_at
       AND staff_user.status = 'ACTIVE'
     FOR UPDATE OF session`,
    [hashStaffCredential("access", token)],
  );
  const row = result.rows[0];
  if (result.rowCount !== 1 || row === undefined) {
    throw new UnauthorizedException();
  }
  return {
    audience: "EMPLOYEE",
    staffAuthSessionId: row.session_id,
    userId: row.user_id,
  };
}

export async function lockGuestSubscriptionAuthority(
  transaction: PostgresTransaction,
  rawToken: string,
): Promise<GuestSubscriptionAuthority> {
  if (!guestTokenPattern.test(rawToken)) {
    throw new GuestAccessError("GUEST_ACCESS_INVALID");
  }
  const result = await transaction.query<{
    access_generation: string;
    valet_session_id: string;
  }>(
    `SELECT session.id::text AS valet_session_id,
            session.customer_access_generation::text AS access_generation
     FROM valet_sessions AS session
     WHERE session.customer_access_token_hash = $1
       AND session.customer_access_generation IS NOT NULL
       AND session.customer_access_revoked_at IS NULL
       AND session.customer_access_expires_at > clock_timestamp()
       AND session.state <> 'COMPLETED'
     FOR UPDATE OF session`,
    [hashGuestAccessToken(rawToken)],
  );
  const row = result.rows[0];
  if (result.rowCount !== 1 || row === undefined) {
    throw new GuestAccessError("GUEST_ACCESS_INVALID");
  }
  return {
    audience: "GUEST",
    guestAccessGeneration: row.access_generation,
    guestValetSessionId: row.valet_session_id,
  };
}
