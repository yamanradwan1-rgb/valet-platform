import type { Client, Pool } from "pg";
import { expect } from "vitest";

export async function insertMfaRuntimeFixtureSession(
  client: Client,
  userId: string,
  sessionId: string,
  hashCharacter: string,
): Promise<void> {
  await client.query(
    `INSERT INTO staff_auth_sessions
       (id,user_id,current_access_token_hash,access_expires_at,
        absolute_expires_at,created_at,last_rotated_at)
     VALUES ($1,$2,$3,transaction_timestamp()+interval '15 minutes',
             transaction_timestamp()+interval '30 days',
             transaction_timestamp(),transaction_timestamp())`,
    [sessionId, userId, `staff-access-sha256:v1:${hashCharacter.repeat(64)}`],
  );
}

export async function expectMfaGuardFunctionsDenied(
  admin: Pool,
  runtimeRole: string,
): Promise<void> {
  for (const fn of [
    "mfa_totp_factor_guard()",
    "mfa_recovery_code_guard()",
    "mfa_pending_session_owner_guard()",
  ]) {
    const result = await admin.query<{ allowed: boolean }>(
      `SELECT has_function_privilege($1,$2,'EXECUTE') AS allowed`,
      [runtimeRole, `public.${fn}`],
    );
    expect(result.rows[0]?.allowed).toBe(false);
  }
}
