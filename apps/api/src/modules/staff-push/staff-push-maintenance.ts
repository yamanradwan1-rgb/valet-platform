import type { PostgresPool } from "../../common/database/postgres";
import { terminalizeUnclaimableStaffPushDeliveries } from "./staff-push-claim-repository";
import {
  reconcileStaleStaffPushRegistrations,
  type StaleRegistrationResult,
} from "./staff-push-maintenance-repository";
import type { StaffPushOperationalPolicyShape } from "./staff-push-operational-policy";

export interface StaffPushMaintenanceResult extends StaleRegistrationResult {
  readonly terminalizedDeliveries: number;
}

export async function runProviderIndependentStaffPushMaintenance(
  pool: PostgresPool,
  policy: StaffPushOperationalPolicyShape,
): Promise<StaffPushMaintenanceResult> {
  const terminalizedDeliveries =
    await terminalizeUnclaimableStaffPushDeliveries(pool);
  const stale = await reconcileStaleStaffPushRegistrations(
    pool,
    policy.activeRegistrationStaleDays,
  );
  return { terminalizedDeliveries, ...stale };
}
