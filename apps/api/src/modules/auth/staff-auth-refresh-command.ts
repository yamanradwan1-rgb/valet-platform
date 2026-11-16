import { randomUUID } from "node:crypto";
import type { PostgresPool } from "../../common/database/postgres";
import {
  generateStaffCredential,
  staffCredentialHash,
} from "./staff-auth-credential";
import { staffAuthTokenResult } from "./staff-auth-token-result";
import { hashSubmittedStaffRefresh } from "./staff-auth-vap1-refresh";
import { staffAuthWriterTransaction } from "./staff-auth-writer-transaction";
import { lockStaffRefreshUserSecurityBoundary } from "./staff-user-security-lock";
import {
  StaffAuthenticationError,
  type DatabaseClockRow,
  type LoginSessionRow,
  type RefreshCredentialRow,
  type StaffAuthTokens,
} from "./staff-auth-types";

export async function rotateStaffRefresh(
  _reader: PostgresPool,
  writer: PostgresPool,
  refreshToken: string,
): Promise<StaffAuthTokens> {
  const previousHash = hashSubmittedStaffRefresh(refreshToken);
  if (!previousHash) throw new StaffAuthenticationError();
  const accessToken = generateStaffCredential("vsa1.");
  const replacementRefreshToken = generateStaffCredential("vsr1.");
  const accessHash = staffCredentialHash("access", accessToken);
  const replacementHash = staffCredentialHash(
    "refresh",
    replacementRefreshToken,
  );
  const replacementId = randomUUID();
  let priorId: string | undefined;
  let priorSessionId: string | undefined;
  let priorGeneration: number | undefined;
  const result = await staffAuthWriterTransaction(
    writer,
    async (transaction) => {
      if (
        !(await lockStaffRefreshUserSecurityBoundary(transaction, previousHash))
      ) {
        throw new StaffAuthenticationError();
      }
      const locked = await transaction.query<RefreshCredentialRow>(
        `SELECT refresh.id, refresh.session_id, refresh.generation,
              refresh.expires_at, refresh.consumed_at,
              session.absolute_expires_at, session.revoked_at, staff_user.status
       FROM staff_refresh_credentials AS refresh
       INNER JOIN staff_auth_sessions AS session ON session.id = refresh.session_id
       INNER JOIN users AS staff_user ON staff_user.id = session.user_id
       WHERE refresh.token_hash = $1
       FOR UPDATE OF refresh, session, staff_user`,
        [previousHash],
      );
      const credential = locked.rows[0];
      if (!credential) throw new StaffAuthenticationError();
      const databaseNow = (
        await transaction.query<DatabaseClockRow>(
          "SELECT clock_timestamp() AS now",
        )
      ).rows[0]?.now;
      if (!databaseNow) throw new StaffAuthenticationError();

      if (credential.consumed_at !== null) {
        await transaction.query(
          `UPDATE staff_auth_sessions SET revoked_at = COALESCE(revoked_at, $2::timestamptz)
         WHERE id = $1`,
          [credential.session_id, databaseNow],
        );
        return { authenticationFailed: true } as const;
      }
      if (
        credential.revoked_at !== null ||
        credential.status !== "ACTIVE" ||
        credential.expires_at.getTime() <= databaseNow.getTime() ||
        credential.absolute_expires_at.getTime() <= databaseNow.getTime()
      ) {
        await transaction.query(
          `UPDATE staff_auth_sessions SET revoked_at = COALESCE(revoked_at, $2::timestamptz)
         WHERE id = $1`,
          [credential.session_id, databaseNow],
        );
        return { authenticationFailed: true } as const;
      }
      priorId = credential.id;
      priorSessionId = credential.session_id;
      priorGeneration = credential.generation;
      await transaction.query(
        `UPDATE staff_refresh_credentials SET consumed_at = $2::timestamptz WHERE id = $1`,
        [credential.id, databaseNow],
      );
      await transaction.query(
        `INSERT INTO staff_refresh_credentials (
         id, session_id, token_hash, generation, created_at, expires_at
       ) VALUES ($1, $2, $3, $4, $5::timestamptz, $6)`,
        [
          replacementId,
          credential.session_id,
          replacementHash,
          credential.generation + 1,
          databaseNow,
          credential.absolute_expires_at,
        ],
      );
      await transaction.query(
        `UPDATE staff_refresh_credentials SET replaced_by_credential_id = $1 WHERE id = $2`,
        [replacementId, credential.id],
      );
      const updated = await transaction.query<LoginSessionRow>(
        `UPDATE staff_auth_sessions
       SET current_access_token_hash = $1,
           access_expires_at = LEAST($3::timestamptz + INTERVAL '15 minutes', absolute_expires_at),
           last_rotated_at = $3::timestamptz
       WHERE id = $2
       RETURNING id, access_expires_at, absolute_expires_at,
         GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (absolute_expires_at - $3::timestamptz)))::integer)
           AS refresh_cookie_max_age_seconds`,
        [accessHash, credential.session_id, databaseNow],
      );
      if (!updated.rows[0]) throw new StaffAuthenticationError();
      return { authenticationFailed: false, session: updated.rows[0] } as const;
    },
    async (committed) => {
      if (
        committed.authenticationFailed ||
        !priorId ||
        !priorSessionId ||
        priorGeneration === undefined
      )
        return false;
      const verified = await writer.query<{ complete: boolean }>(
        `SELECT EXISTS (
         SELECT 1 FROM staff_refresh_credentials AS previous
         JOIN staff_refresh_credentials AS replacement
           ON replacement.id=previous.replaced_by_credential_id
         JOIN staff_auth_sessions AS session ON session.id=previous.session_id
         JOIN users AS staff_user ON staff_user.id=session.user_id
         WHERE previous.id=$1 AND previous.token_hash=$2
           AND previous.session_id=$3 AND previous.generation=$4
           AND previous.consumed_at IS NOT NULL AND previous.replaced_by_credential_id=$5
           AND replacement.id=$5 AND replacement.session_id=$3
           AND replacement.generation=$4 + 1 AND replacement.token_hash=$6
           AND replacement.consumed_at IS NULL AND replacement.expires_at=session.absolute_expires_at
           AND session.current_access_token_hash=$7 AND session.revoked_at IS NULL
           AND session.access_expires_at=$8 AND session.absolute_expires_at=$9
           AND staff_user.status='ACTIVE'
       ) AS complete`,
        [
          priorId,
          previousHash,
          priorSessionId,
          priorGeneration,
          replacementId,
          replacementHash,
          accessHash,
          committed.session.access_expires_at,
          committed.session.absolute_expires_at,
        ],
      );
      return verified.rows[0]?.complete === true;
    },
  );
  if (result.authenticationFailed) throw new StaffAuthenticationError();
  return staffAuthTokenResult(
    result.session,
    accessToken,
    replacementRefreshToken,
  );
}
