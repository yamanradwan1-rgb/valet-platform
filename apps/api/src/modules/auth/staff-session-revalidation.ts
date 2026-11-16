import type { PostgresTransaction } from "../../common/database/postgres";
import type { StaffSessionContext } from "./staff-session-context";
import { lockStaffSessionWithBearer } from "./staff-session-lock";

export interface LockedStaffSessionContext {
  readonly created_at: Date;
  readonly id: string;
  readonly user_id: string;
}

export async function lockAndRecheckStaffSessionContext(
  transaction: PostgresTransaction,
  context: StaffSessionContext,
): Promise<LockedStaffSessionContext | undefined> {
  const session = await lockStaffSessionWithBearer(
    transaction,
    context,
    "EXCLUSIVE",
  );
  if (session === undefined) return undefined;
  return {
    id: session.id,
    user_id: session.user_id,
    created_at: session.created_at,
  };
}
