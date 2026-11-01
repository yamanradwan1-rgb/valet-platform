import { setTimeout } from "node:timers/promises";
import {
  remainingDatabaseOperationMs,
  RuntimeDatabaseUnavailableError,
  withGeneralDatabaseDeadline,
} from "../../common/database/runtime-database-deadline";
import {
  PresenceManagementBusyError,
  type PresenceManagementOperation,
} from "./presence-management-diagnostics";

export const presenceReadBudget = { maximumMs: 2000, attempts: 8 } as const;

export function isRecoverablePresenceRead(
  operation: PresenceManagementOperation,
): boolean {
  return [
    "COMPANY_POLICY_READ",
    "LOCATION_POLICY_READ",
    "ZONE_LIST",
    "ZONE_READ",
  ].includes(operation);
}

/** The callback owns a NEW complete transaction, including all authority checks. */
export async function recoverPresenceManagementRead<T>(
  attempt: () => Promise<T>,
): Promise<T> {
  try {
    return await withGeneralDatabaseDeadline(
      presenceReadBudget.maximumMs,
      async () => {
        for (let index = 0; ; index++) {
          remainingDatabaseOperationMs();
          try {
            return await attempt();
          } catch (error) {
            if (
              !(error instanceof PresenceManagementBusyError) ||
              error.origin !== "ADVISORY_TRY_LOCK_BUSY" ||
              index + 1 >= presenceReadBudget.attempts
            )
              throw error;
            // inPostgresTransaction has rolled back and released every lock first.
            const delay = Math.min(25 * 2 ** index, 200);
            if (
              remainingDatabaseOperationMs(presenceReadBudget.maximumMs) <=
              delay
            )
              throw error;
            await setTimeout(delay);
          }
        }
      },
    );
  } catch (error) {
    if (
      error instanceof RuntimeDatabaseUnavailableError &&
      error.reason === "OPERATION_DEADLINE"
    )
      throw new PresenceManagementBusyError("READ_BUDGET_EXHAUSTED");
    throw error;
  }
}
