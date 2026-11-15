import { randomUUID } from "node:crypto";
import type { PostgresPool } from "../../common/database/postgres";
import { AntiAbuseUnavailableError, type AntiAbuseReservation } from "../anti-abuse/anti-abuse.service";
import { generateStaffCredential, staffCredentialHash } from "./staff-auth-credential";
import { staffAuthTokenResult } from "./staff-auth-token-result";
import { verifySubmittedStaffLoginPassword } from "./staff-auth-vap1-login-ceremony";
import { staffAuthWriterTransaction } from "./staff-auth-writer-transaction";
import { lockAndRecheckStaffLoginUser } from "./staff-user-security-lock";
import {
  StaffAuthenticationError,
  type DatabaseClockRow,
  type LoginSessionRow,
  type StaffAuthTokens,
  type StaffPasswordVerifier,
  type UserAuthenticationRow,
} from "./staff-auth-types";

export async function issueStaffLogin(
  reader: PostgresPool,
  writer: PostgresPool,
  verifier: StaffPasswordVerifier,
  email: string,
  password: string,
  identifierReservation?: AntiAbuseReservation,
): Promise<StaffAuthTokens> {
  const lookup = await reader.query<UserAuthenticationRow>(
    "SELECT id, password_hash, status FROM users WHERE email = $1", [email],
  );
  const user = lookup.rows[0];
  const verifiedHash = await verifySubmittedStaffLoginPassword({
    user, submittedPassword: password, verifier,
  });
  if (!user) throw new StaffAuthenticationError();

  const accessToken = generateStaffCredential("vsa1.");
  const refreshToken = generateStaffCredential("vsr1.");
  const accessHash = staffCredentialHash("access", accessToken);
  const refreshHash = staffCredentialHash("refresh", refreshToken);
  const sessionId = randomUUID();
  const refreshId = randomUUID();
  const reservation = identifierReservation?.id === undefined
    ? undefined : identifierReservation;

  const session = await staffAuthWriterTransaction(writer, async (transaction) => {
    if (!(await lockAndRecheckStaffLoginUser(transaction, user.id, verifiedHash))) {
      throw new StaffAuthenticationError();
    }
    const databaseNow = (await transaction.query<DatabaseClockRow>(
      "SELECT clock_timestamp() AS now",
    )).rows[0]?.now;
    if (!databaseNow) throw new StaffAuthenticationError();
    const inserted = await transaction.query<LoginSessionRow>(
      `INSERT INTO staff_auth_sessions (
         id, user_id, current_access_token_hash, access_expires_at,
         absolute_expires_at, created_at, last_rotated_at
       ) VALUES (
         $1, $2, $3,
         LEAST($4::timestamptz + INTERVAL '15 minutes', $4::timestamptz + INTERVAL '720 hours'),
         $4::timestamptz + INTERVAL '720 hours',
         $4::timestamptz, $4::timestamptz
       )
       RETURNING id, access_expires_at, absolute_expires_at,
                 2592000 AS refresh_cookie_max_age_seconds`,
      [sessionId, user.id, accessHash, databaseNow],
    );
    await transaction.query(
      `INSERT INTO staff_refresh_credentials (
         id, session_id, token_hash, generation, created_at, expires_at
       ) VALUES ($1, $2, $3, 1, $4::timestamptz, $4::timestamptz + INTERVAL '720 hours')`,
      [refreshId, sessionId, refreshHash, databaseNow],
    );
    await transaction.query(
      `UPDATE users SET last_login_at = $2::timestamptz,
                        updated_at = $2::timestamptz WHERE id = $1`,
      [user.id, databaseNow],
    );
    if (reservation) {
      let finalized: { rows: Array<{ finalized: number }> };
      try {
        await transaction.query("SET LOCAL lock_timeout = '2s'");
        finalized = await transaction.query<{ finalized: number }>(
          "SELECT public.s04_staff_login_success($1::uuid,$2::text) AS finalized",
          [reservation.id, reservation.key.keyHash],
        );
      } catch {
        throw new AntiAbuseUnavailableError();
      }
      if (finalized.rows[0]?.finalized !== 1) throw new AntiAbuseUnavailableError();
    }
    const row = inserted.rows[0];
    if (!row) throw new Error("Authentication session was not created.");
    return row;
  }, async (row) => {
    const verified = await reader.query<{ complete: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM staff_auth_sessions AS session
         JOIN staff_refresh_credentials AS refresh ON refresh.session_id=session.id
         JOIN users AS staff_user ON staff_user.id=session.user_id
         WHERE session.id=$1 AND session.user_id=$2 AND session.revoked_at IS NULL
           AND session.current_access_token_hash=$3
           AND session.access_expires_at=$4 AND session.absolute_expires_at=$5
           AND refresh.id=$6 AND refresh.token_hash=$7 AND refresh.generation=1
           AND refresh.consumed_at IS NULL AND refresh.expires_at=session.absolute_expires_at
           AND staff_user.status='ACTIVE'
           AND staff_user.last_login_at >= session.created_at
           AND ($8::uuid IS NULL OR EXISTS (
             SELECT 1 FROM anti_abuse_events AS event
             WHERE event.id=$8 AND event.scope=$9 AND event.key_hash=$10
               AND event.state='IGNORED'
           ))
       ) AS complete`,
      [sessionId, user.id, accessHash, row.access_expires_at,
       row.absolute_expires_at, refreshId, refreshHash,
       reservation?.id ?? null, reservation?.key.scope ?? null,
       reservation?.key.keyHash ?? null],
    );
    return verified.rows[0]?.complete === true;
  });
  return staffAuthTokenResult(session, accessToken, refreshToken);
}
