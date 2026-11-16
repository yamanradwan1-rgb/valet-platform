import type {
  PostgresPool,
  PostgresTransaction,
} from "../../common/database/postgres";
import type { StaffSessionContext } from "./staff-session-context";
import { accessTokenPattern } from "./staff-auth-credential";

export type StaffSessionLockMode = "SHARED" | "EXCLUSIVE";

export interface LockedStaffSessionRow {
  readonly absolute_expires_at: Date;
  readonly checked_at: Date;
  readonly created_at: Date;
  readonly id: string;
  readonly last_admin_activity_at: Date | null;
  readonly mfa_authenticated_at: Date | null;
  readonly mfa_factor_id: string | null;
  readonly user_id: string;
}

type StaffSessionLockQueryable =
  Pick<PostgresPool, "query"> | PostgresTransaction;

async function callStaffSessionLock(
  queryable: StaffSessionLockQueryable,
  input: {
    readonly bearer: string;
    readonly createdAt: Date | null;
    readonly mode: StaffSessionLockMode;
    readonly sessionId: string | null;
    readonly userId: string | null;
  },
): Promise<LockedStaffSessionRow | undefined> {
  if (!accessTokenPattern.test(input.bearer)) return undefined;
  const result = await queryable.query<LockedStaffSessionRow>(
    `SELECT session_id AS id, user_id, created_at, absolute_expires_at,
            mfa_authenticated_at, mfa_factor_id, last_admin_activity_at,
            checked_at
     FROM public.staff_auth_lock_current_session(
       $1::uuid, $2::uuid, $3::text, $4::timestamptz, $5::text
     )`,
    [input.sessionId, input.userId, input.bearer, input.createdAt, input.mode],
  );
  return result.rows[0];
}

export function resolveStaffSessionWithBearer(
  queryable: StaffSessionLockQueryable,
  bearer: string,
): Promise<LockedStaffSessionRow | undefined> {
  return callStaffSessionLock(queryable, {
    bearer,
    createdAt: null,
    mode: "SHARED",
    sessionId: null,
    userId: null,
  });
}

export async function lockStaffSessionWithBearer(
  transaction: StaffSessionLockQueryable,
  context: StaffSessionContext,
  mode: StaffSessionLockMode,
): Promise<LockedStaffSessionRow | undefined> {
  const bearer = context.rawAccessToken;
  if (bearer === undefined) return undefined;
  return callStaffSessionLock(transaction, {
    bearer,
    createdAt: context.createdAt,
    mode,
    sessionId: context.staffAuthSessionId,
    userId: context.userId,
  });
}
