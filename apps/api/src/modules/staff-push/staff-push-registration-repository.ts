import type { StaffPushRegistrationRequest } from "@valet/contracts";

import type { PostgresTransaction } from "../../common/database/postgres";
import type { StaffSessionContext } from "../auth/staff-session-context";
import type {
  ActiveRegistrationRow,
  LockedStaffSessionRow,
  RegistrationRow,
} from "./staff-push-registration-types";

export async function lockAndRecheckStaffSession(
  transaction: PostgresTransaction,
  context: StaffSessionContext,
): Promise<LockedStaffSessionRow | undefined> {
  const result = await transaction.query<LockedStaffSessionRow>(
    `SELECT session.id, session.user_id, session.created_at
     FROM staff_auth_sessions AS session
     INNER JOIN users AS staff_user ON staff_user.id = session.user_id
     WHERE session.id = $1
       AND session.user_id = $2
       AND session.current_access_token_hash = $3
       AND session.revoked_at IS NULL
       AND clock_timestamp() < session.access_expires_at
       AND clock_timestamp() < session.absolute_expires_at
       AND staff_user.status = 'ACTIVE'
     FOR UPDATE OF session`,
    [context.staffAuthSessionId, context.userId, context.accessTokenHash],
  );
  return result.rows[0];
}

export async function lockRegistrationKeys(
  transaction: PostgresTransaction,
  lockKeys: readonly string[],
): Promise<void> {
  for (const lockKey of lockKeys) {
    await transaction.query(
      `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
      [lockKey],
    );
  }
}

export async function findActiveRegistrations(
  transaction: PostgresTransaction,
  input: StaffPushRegistrationRequest,
  tokenHash: string,
): Promise<readonly ActiveRegistrationRow[]> {
  const result = await transaction.query<ActiveRegistrationRow>(
    `SELECT registration.id, registration.staff_auth_session_id,
            registration.provider, registration.platform,
            registration.app_identifier, registration.installation_id,
            registration.token_hash, registration.app_version,
            registration.app_build, registration.locale,
            registration.last_confirmed_at,
            owner.created_at AS owner_created_at,
            owner.user_id AS owner_user_id,
            (owner.revoked_at IS NULL
              AND clock_timestamp() < owner.absolute_expires_at
              AND owner_user.status = 'ACTIVE') AS owner_current
     FROM staff_push_registrations AS registration
     INNER JOIN staff_auth_sessions AS owner
       ON owner.id = registration.staff_auth_session_id
     INNER JOIN users AS owner_user ON owner_user.id = owner.user_id
     WHERE registration.provider = $1
       AND registration.state = 'ACTIVE'
       AND ((registration.app_identifier = $2
             AND registration.installation_id = $3)
            OR registration.token_hash = $4)
     ORDER BY registration.id
     FOR UPDATE OF registration`,
    [input.provider, input.appIdentifier, input.installationId, tokenHash],
  );
  return result.rows;
}

export async function confirmRegistration(
  transaction: PostgresTransaction,
  registrationId: string,
  input: StaffPushRegistrationRequest,
): Promise<RegistrationRow> {
  const result = await transaction.query<RegistrationRow>(
    `UPDATE staff_push_registrations
     SET app_version = $2, app_build = $3, locale = $4,
         last_confirmed_at = clock_timestamp(),
         updated_at = clock_timestamp()
     WHERE id = $1 AND state = 'ACTIVE'
     RETURNING id, staff_auth_session_id, provider, platform, app_identifier,
               installation_id, app_version, app_build, locale, state,
               last_confirmed_at`,
    [registrationId, input.appVersion, input.appBuild, input.locale],
  );
  const row = result.rows[0];
  if (row === undefined) throw new Error("Registration confirmation failed.");
  return row;
}

export async function supersedeRegistration(
  transaction: PostgresTransaction,
  registrationId: string,
  successorId: string,
  reason: "ACCOUNT_SWITCH" | "TOKEN_ROTATION",
): Promise<void> {
  const result = await transaction.query(
    `UPDATE staff_push_registrations
     SET state = 'SUPERSEDED', provider_token = NULL,
         terminal_at = clock_timestamp(), terminal_reason_class = $3,
         superseded_by_registration_id = $2,
         updated_at = clock_timestamp()
     WHERE id = $1 AND state = 'ACTIVE'`,
    [registrationId, successorId, reason],
  );
  if (result.rowCount !== 1)
    throw new Error("Registration supersession failed.");
}

export async function insertRegistration(
  transaction: PostgresTransaction,
  registrationId: string,
  staffAuthSessionId: string,
  input: StaffPushRegistrationRequest,
  tokenHash: string,
): Promise<RegistrationRow> {
  const result = await transaction.query<RegistrationRow>(
    `INSERT INTO staff_push_registrations
       (id, staff_auth_session_id, provider, platform, app_identifier,
        installation_id, provider_token, token_hash, app_version, app_build,
        locale, last_confirmed_at, created_at, updated_at)
     SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
            clock.now, clock.now, clock.now
     FROM (SELECT clock_timestamp() AS now) AS clock
     RETURNING id, staff_auth_session_id, provider, platform, app_identifier,
               installation_id, app_version, app_build, locale, state,
               last_confirmed_at`,
    [
      registrationId,
      staffAuthSessionId,
      input.provider,
      input.platform,
      input.appIdentifier,
      input.installationId,
      input.providerToken,
      tokenHash,
      input.appVersion,
      input.appBuild,
      input.locale,
    ],
  );
  const row = result.rows[0];
  if (row === undefined) throw new Error("Registration creation failed.");
  return row;
}

export async function findOwnedRegistration(
  transaction: PostgresTransaction,
  registrationId: string,
  staffAuthSessionId: string,
): Promise<RegistrationRow | undefined> {
  const result = await transaction.query<RegistrationRow>(
    `SELECT id, staff_auth_session_id, provider, platform, app_identifier,
            installation_id, app_version, app_build, locale, state,
            last_confirmed_at
     FROM staff_push_registrations
     WHERE id = $1 AND staff_auth_session_id = $2
     FOR UPDATE`,
    [registrationId, staffAuthSessionId],
  );
  return result.rows[0];
}

export async function disableRegistration(
  transaction: PostgresTransaction,
  registrationId: string,
): Promise<RegistrationRow> {
  const result = await transaction.query<RegistrationRow>(
    `UPDATE staff_push_registrations
     SET state = 'DISABLED', provider_token = NULL,
         terminal_at = clock_timestamp(),
         terminal_reason_class = 'EXPLICIT_DISABLE',
         updated_at = clock_timestamp()
     WHERE id = $1 AND state = 'ACTIVE'
     RETURNING id, staff_auth_session_id, provider, platform, app_identifier,
               installation_id, app_version, app_build, locale, state,
               last_confirmed_at`,
    [registrationId],
  );
  const row = result.rows[0];
  if (row === undefined) throw new Error("Registration disable failed.");
  return row;
}
