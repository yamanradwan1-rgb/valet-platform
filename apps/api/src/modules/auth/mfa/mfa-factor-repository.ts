import type { PostgresTransaction } from "../../../common/database/postgres";

export type MfaFactorState = "ACTIVE" | "PENDING" | "RETIRED";

export interface MfaFactorRow {
  readonly activated_at: Date | null;
  readonly created_at: Date;
  readonly id: string;
  readonly last_accepted_step: string | number | bigint | null;
  readonly pending_enrollment_session_id: string | null;
  readonly protected_secret: string;
  readonly recovery_set_generation: number;
  readonly retired_at: Date | null;
  readonly state: MfaFactorState;
  readonly user_id: string;
}

export async function lockCurrentFactor(
  transaction: PostgresTransaction,
  userId: string,
): Promise<MfaFactorRow | undefined> {
  const result = await transaction.query<MfaFactorRow>(
    `SELECT id, user_id, state, protected_secret, pending_enrollment_session_id, last_accepted_step,
            recovery_set_generation, created_at, activated_at, retired_at
     FROM user_mfa_totp_factors
     WHERE user_id = $1 AND state IN ('PENDING', 'ACTIVE')
     FOR UPDATE`,
    [userId],
  );
  if ((result.rowCount ?? 0) > 1) {
    throw new Error("MFA factor uniqueness invariant failed.");
  }
  return result.rows[0];
}

export async function lockFactorById(
  transaction: PostgresTransaction,
  userId: string,
  factorId: string,
): Promise<MfaFactorRow | undefined> {
  const result = await transaction.query<MfaFactorRow>(
    `SELECT id, user_id, state, protected_secret, pending_enrollment_session_id, last_accepted_step,
            recovery_set_generation, created_at, activated_at, retired_at
     FROM user_mfa_totp_factors
     WHERE user_id = $1 AND id = $2
     FOR UPDATE`,
    [userId, factorId],
  );
  return result.rows[0];
}

export async function insertPendingFactor(
  transaction: PostgresTransaction,
  input: {
    readonly id: string;
    readonly protectedSecret: string;
    readonly sessionId: string;
    readonly userId: string;
  },
): Promise<MfaFactorRow> {
  const result = await transaction.query<MfaFactorRow>(
    `INSERT INTO user_mfa_totp_factors
       (id, user_id, state, protected_secret, pending_enrollment_session_id)
     VALUES ($1, $2, 'PENDING', $3, $4)
     RETURNING id, user_id, state, protected_secret, pending_enrollment_session_id, last_accepted_step,
               recovery_set_generation, created_at, activated_at, retired_at`,
    [input.id, input.userId, input.protectedSecret, input.sessionId],
  );
  const row = result.rows[0];
  if (row === undefined) throw new Error("MFA pending factor was not created.");
  return row;
}

export async function retireFactor(
  transaction: PostgresTransaction,
  factorId: string,
  now: Date,
): Promise<void> {
  const updated = await transaction.query(
    `UPDATE user_mfa_totp_factors
     SET state = 'RETIRED', retired_at = $2::timestamptz
     WHERE id = $1 AND state IN ('PENDING', 'ACTIVE')`,
    [factorId, now],
  );
  if (updated.rowCount !== 1) {
    throw new Error("MFA factor retirement conflict.");
  }
}
