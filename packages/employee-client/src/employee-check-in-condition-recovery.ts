import { hydrateCheckInSession } from "./employee-check-in-discovery";
import type {
  EmployeeCheckInAuthoritativeSession,
  EmployeeCheckInConditionSelection,
} from "./employee-check-in-types";
import { operationalFailure } from "./employee-operational-recovery";

export interface ConditionRecoveryAttempt {
  readonly expectedVersion: number;
  readonly identityGeneration: number;
  readonly locationId: string;
  readonly request: number;
  readonly selection: EmployeeCheckInConditionSelection;
  readonly sessionId: string;
  readonly workflowOwner: string;
}

export interface ConditionReconciliationResult {
  readonly active: EmployeeCheckInAuthoritativeSession;
  readonly completed: boolean;
}

export type ConditionReconciliationOutcome =
  | {
      readonly kind: "READ_FAILED";
      readonly failure: ReturnType<typeof operationalFailure>;
    }
  | {
      readonly kind: "RECONCILED";
      readonly result: ConditionReconciliationResult;
    };

/**
 * Canonical reread after an unknown or contested condition/completion
 * outcome. AWAITING_PARKING proves the completion committed; CHECKING_IN
 * keeps the flow on the selection step with the append-only note protected
 * against duplicate replay (DEC-063 REHYDRATE_BEFORE_RETRY).
 */
export async function reconcileConditionOutcome(
  transport: Parameters<typeof hydrateCheckInSession>[0],
  attempt: ConditionRecoveryAttempt,
): Promise<ConditionReconciliationOutcome> {
  try {
    const current = await hydrateCheckInSession(
      transport,
      attempt.locationId,
      attempt.sessionId,
    );
    return {
      kind: "RECONCILED",
      result: {
        active: current,
        completed: current.state === "AWAITING_PARKING",
      },
    };
  } catch (error) {
    return { kind: "READ_FAILED", failure: operationalFailure(error) };
  }
}
