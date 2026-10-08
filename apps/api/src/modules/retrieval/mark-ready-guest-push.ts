import type { PostgresTransaction } from "../../common/database/postgres";
import type { LockedMarkReadySession } from "./mark-ready-types";

export async function persistGuestReadyPush(
  transaction: PostgresTransaction,
  session: LockedMarkReadySession,
  readyAt: Date,
): Promise<void> {
  await transaction.query(
    `SELECT intent_id, delivery_count
     FROM public.guest_push_ready_intent_v1($1,$2,$3,$4)`,
    [session.organization_id, session.location_id, session.id, readyAt],
  );
}
