import { StaffAuthenticationError } from "./staff-auth-types";
import type {
  UserAuthenticationRow,
  LoginSessionRow,
  RefreshCredentialRow,
  DatabaseClockRow,
  StaffPasswordVerifier,
  StaffAuthTokens,
} from "./staff-auth-types";
export { StaffAuthenticationError } from "./staff-auth-types";
export type {
  StaffPasswordVerifier,
  StaffAuthTokens,
} from "./staff-auth-types";
import { randomUUID } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";
import { inPostgresTransaction as inTransaction } from "../../common/database/postgres-transaction";
import {
  isAcceptedStaffPasswordHash,
  STAFF_AUTH_DUMMY_PASSWORD_HASH,
} from "./staff-password-verification";
export {
  Argon2StaffPasswordVerifier,
  isAcceptedStaffPasswordHash,
  STAFF_AUTH_DUMMY_PASSWORD_HASH,
} from "./staff-password-verification";

import type { PostgresPool } from "../../common/database/postgres";
import { RUNTIME_POSTGRES_POOL } from "../../common/database/runtime-database.module";
import {
  AntiAbuseUnavailableError,
  type AntiAbuseReservation,
} from "../anti-abuse/anti-abuse.service";
import {
  generateStaffCredential,
  refreshTokenPattern,
  staffCredentialHash,
} from "./staff-auth-credential";
import { logoutStaffSession } from "./staff-auth-logout";
import { staffAuthTokenResult } from "./staff-auth-token-result";
import {
  lockAndRecheckStaffLoginUser,
  lockStaffRefreshUserSecurityBoundary,
} from "./staff-user-security-lock";

export { DatabaseStaffPrincipalResolver } from "./staff-session-context";

export const STAFF_PASSWORD_VERIFIER = Symbol("STAFF_PASSWORD_VERIFIER");

@Injectable()
export class StaffAuthService {
  constructor(
    @Inject(RUNTIME_POSTGRES_POOL) private readonly pool: PostgresPool,
    @Inject(STAFF_PASSWORD_VERIFIER)
    private readonly passwordVerifier: StaffPasswordVerifier,
  ) {}

  async login(
    email: string,
    password: string,
    identifierReservation?: AntiAbuseReservation,
  ): Promise<StaffAuthTokens> {
    const lookup = await this.pool.query<UserAuthenticationRow>(
      `SELECT id, password_hash, status FROM users WHERE email = $1`,
      [email],
    );
    const user = lookup.rows[0];
    const supported =
      user !== undefined &&
      user.password_hash !== null &&
      isAcceptedStaffPasswordHash(user.password_hash);
    const hashToVerify =
      supported && user.password_hash !== null
        ? user.password_hash
        : STAFF_AUTH_DUMMY_PASSWORD_HASH;
    const passwordMatches = await this.passwordVerifier.verify(
      hashToVerify,
      password,
    );
    if (
      user === undefined ||
      user.password_hash === null ||
      !supported ||
      !passwordMatches ||
      user.status !== "ACTIVE"
    ) {
      throw new StaffAuthenticationError();
    }

    const accessToken = generateStaffCredential("vsa1.");
    const refreshToken = generateStaffCredential("vsr1.");
    const sessionId = randomUUID();
    const refreshId = randomUUID();
    const session = await inTransaction(this.pool, async (transaction) => {
      if (
        !(await lockAndRecheckStaffLoginUser(
          transaction,
          user.id,
          hashToVerify,
        ))
      ) {
        throw new StaffAuthenticationError();
      }
      const databaseNow = (
        await transaction.query<DatabaseClockRow>(
          `SELECT clock_timestamp() AS now`,
        )
      ).rows[0]?.now;
      if (databaseNow === undefined) throw new StaffAuthenticationError();
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
         RETURNING access_expires_at, absolute_expires_at,
                   2592000 AS refresh_cookie_max_age_seconds`,
        [
          sessionId,
          user.id,
          staffCredentialHash("access", accessToken),
          databaseNow,
        ],
      );
      await transaction.query(
        `INSERT INTO staff_refresh_credentials (
           id, session_id, token_hash, generation, created_at, expires_at
         ) VALUES ($1, $2, $3, 1, $4::timestamptz, $4::timestamptz + INTERVAL '720 hours')`,
        [
          refreshId,
          sessionId,
          staffCredentialHash("refresh", refreshToken),
          databaseNow,
        ],
      );
      await transaction.query(
        `UPDATE users
         SET last_login_at = $2::timestamptz, updated_at = $2::timestamptz
         WHERE id = $1`,
        [user.id, databaseNow],
      );
      if (identifierReservation !== undefined) {
        let finalized;
        try {
          await transaction.query("SET LOCAL lock_timeout = '2s'");
          finalized = await transaction.query(
            `UPDATE anti_abuse_events
             SET state = 'IGNORED'
             WHERE id = $1
               AND scope = $2
               AND key_hash = $3
               AND state = 'PENDING'`,
            [
              identifierReservation.id,
              identifierReservation.key.scope,
              identifierReservation.key.keyHash,
            ],
          );
        } catch {
          throw new AntiAbuseUnavailableError();
        }
        if (finalized.rowCount !== 1) {
          throw new AntiAbuseUnavailableError();
        }
      }
      const row = inserted.rows[0];
      if (row === undefined)
        throw new Error("Authentication session was not created.");
      return row;
    });
    return staffAuthTokenResult(session, accessToken, refreshToken);
  }

  async refresh(refreshToken: string): Promise<StaffAuthTokens> {
    if (!refreshTokenPattern.test(refreshToken)) {
      throw new StaffAuthenticationError();
    }
    const accessToken = generateStaffCredential("vsa1.");
    const replacementRefreshToken = generateStaffCredential("vsr1.");
    const replacementId = randomUUID();
    const refreshHash = staffCredentialHash("refresh", refreshToken);
    const result = await inTransaction(this.pool, async (transaction) => {
      if (
        !(await lockStaffRefreshUserSecurityBoundary(transaction, refreshHash))
      ) {
        throw new StaffAuthenticationError();
      }
      const locked = await transaction.query<RefreshCredentialRow>(
        `SELECT refresh.id, refresh.session_id, refresh.generation,
                refresh.expires_at, refresh.consumed_at,
                session.absolute_expires_at, session.revoked_at,
                staff_user.status
         FROM staff_refresh_credentials AS refresh
         INNER JOIN staff_auth_sessions AS session ON session.id = refresh.session_id
         INNER JOIN users AS staff_user ON staff_user.id = session.user_id
         WHERE refresh.token_hash = $1
         FOR UPDATE OF refresh, session, staff_user`,
        [refreshHash],
      );
      const credential = locked.rows[0];
      if (credential === undefined) throw new StaffAuthenticationError();
      const databaseNow = (
        await transaction.query<DatabaseClockRow>(
          `SELECT clock_timestamp() AS now`,
        )
      ).rows[0]?.now;
      if (databaseNow === undefined) throw new StaffAuthenticationError();

      if (credential.consumed_at !== null) {
        await transaction.query(
          `UPDATE staff_auth_sessions
           SET revoked_at = COALESCE(revoked_at, $2::timestamptz)
           WHERE id = $1`,
          [credential.session_id, databaseNow],
        );
        return { authenticationFailed: true } as const;
      }
      const valid =
        credential.revoked_at === null &&
        credential.status === "ACTIVE" &&
        credential.expires_at.getTime() > databaseNow.getTime() &&
        credential.absolute_expires_at.getTime() > databaseNow.getTime();
      if (!valid) {
        await transaction.query(
          `UPDATE staff_auth_sessions
           SET revoked_at = COALESCE(revoked_at, $2::timestamptz)
           WHERE id = $1`,
          [credential.session_id, databaseNow],
        );
        return { authenticationFailed: true } as const;
      }

      await transaction.query(
        `UPDATE staff_refresh_credentials
         SET consumed_at = $2::timestamptz
         WHERE id = $1`,
        [credential.id, databaseNow],
      );
      await transaction.query(
        `INSERT INTO staff_refresh_credentials (
           id, session_id, token_hash, generation, created_at, expires_at
         ) VALUES ($1, $2, $3, $4, $5::timestamptz, $6)`,
        [
          replacementId,
          credential.session_id,
          staffCredentialHash("refresh", replacementRefreshToken),
          credential.generation + 1,
          databaseNow,
          credential.absolute_expires_at,
        ],
      );
      await transaction.query(
        `UPDATE staff_refresh_credentials
         SET replaced_by_credential_id = $1
         WHERE id = $2`,
        [replacementId, credential.id],
      );
      const updated = await transaction.query<LoginSessionRow>(
        `UPDATE staff_auth_sessions
         SET current_access_token_hash = $1,
             access_expires_at = LEAST(
               $3::timestamptz + INTERVAL '15 minutes',
               absolute_expires_at
             ),
             last_rotated_at = $3::timestamptz
         WHERE id = $2
         RETURNING access_expires_at, absolute_expires_at,
                   GREATEST(
                     0,
                     FLOOR(EXTRACT(EPOCH FROM (absolute_expires_at - $3::timestamptz)))::integer
                   ) AS refresh_cookie_max_age_seconds`,
        [
          staffCredentialHash("access", accessToken),
          credential.session_id,
          databaseNow,
        ],
      );
      const session = updated.rows[0];
      if (session === undefined) throw new StaffAuthenticationError();
      return { authenticationFailed: false, session } as const;
    });
    if (result.authenticationFailed) throw new StaffAuthenticationError();
    return staffAuthTokenResult(
      result.session,
      accessToken,
      replacementRefreshToken,
    );
  }

  logout(refreshToken: string | undefined): Promise<void> {
    return logoutStaffSession(this.pool, refreshToken);
  }
}
