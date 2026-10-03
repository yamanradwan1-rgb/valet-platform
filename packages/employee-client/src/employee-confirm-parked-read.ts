import { operationalFailure } from "./employee-operational-recovery";
import { loadConfirmParkedCanonical } from "./employee-confirm-parked-operation";
import type { EmployeeConfirmParkedTarget } from "./employee-confirm-parked-state";
import type {
  EmployeeConfirmParkedConflict,
  EmployeeConfirmParkedPhase,
  EmployeeConfirmParkedSnapshot,
  EmployeeConfirmParkedTransport,
} from "./employee-confirm-parked-types";

export async function executeConfirmParkedRead(input: {
  readonly transport: EmployeeConfirmParkedTransport;
  readonly snapshot: EmployeeConfirmParkedSnapshot;
  readonly target: EmployeeConfirmParkedTarget;
  readonly previous: EmployeeConfirmParkedPhase;
  readonly conflict: EmployeeConfirmParkedConflict | null;
  readonly isCurrent: () => boolean;
  readonly current: () => EmployeeConfirmParkedSnapshot;
  readonly publish: (snapshot: EmployeeConfirmParkedSnapshot) => void;
}): Promise<void> {
  try {
    const next = await loadConfirmParkedCanonical(
      input.transport,
      input.snapshot,
      input.target,
      input.previous,
      input.conflict,
    );
    if (input.isCurrent()) input.publish(next);
  } catch (error) {
    if (!input.isCurrent()) return;
    input.publish({
      ...input.current(),
      failure: operationalFailure(error),
      phase: input.previous === "ambiguous" ? "ambiguous" : "unavailable",
    });
  }
}
