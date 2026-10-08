import type { PostgresPool } from "../../common/database/postgres";
import { terminalizeUnclaimableGuestPushDeliveries } from "./guest-push-claim-repository";
import { reconcileEndedGuestPushRegistrations } from "./guest-push-maintenance-repository";

export async function runGuestPushMaintenance(pool: PostgresPool): Promise<{
  readonly suppressedDeliveries: number;
  readonly terminalizedDeliveries: number;
  readonly terminalizedRegistrations: number;
}> {
  const terminalizedDeliveries =
    await terminalizeUnclaimableGuestPushDeliveries(pool);
  const ended = await reconcileEndedGuestPushRegistrations(pool);
  return { terminalizedDeliveries, ...ended };
}
