import type { PostgresTransaction } from "../../common/database/postgres";
import { lockStaffUserSecurityBoundary } from "../auth/staff-user-security-lock";
import { ManagementAccessDeniedError } from "./management-authorization";

export async function lockStaffOnboardingAccount(
  transaction: PostgresTransaction,
  actorUserId: string,
  email: string,
): Promise<void> {
  await transaction.query(
    `SELECT pg_advisory_xact_lock(
       hashtextextended('staff-onboarding-email:' || $1::text, 0)
     )`,
    [email],
  );
  const account = await transaction.query<{ readonly id: string }>(
    `SELECT id::text FROM users WHERE email = $1`,
    [email],
  );
  const ids = [
    ...new Set([actorUserId, ...account.rows.map((row) => row.id)]),
  ].sort();
  for (const id of ids) await lockStaffUserSecurityBoundary(transaction, id);
}

export async function staffOnboardingTargetEmail(
  transaction: PostgresTransaction,
  organizationId: string,
  membershipId: string,
): Promise<string> {
  const target = await transaction.query<{ readonly email: string }>(
    `SELECT account.email FROM organization_memberships AS membership
     INNER JOIN users AS account ON account.id = membership.user_id
     WHERE membership.organization_id = $1 AND membership.id = $2`,
    [organizationId, membershipId],
  );
  const email = target.rows[0]?.email;
  if (email === undefined) throw new ManagementAccessDeniedError();
  return email;
}
