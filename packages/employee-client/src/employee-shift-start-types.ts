import type {
  StaffOperationalContextResponse,
  StaffOperationalLocation,
  StartShiftResponse,
} from "@valet/contracts";

import type { EmployeeOperationalFailure } from "./employee-operational-types";

export type EmployeeShiftStartPhase =
  | "active"
  | "conflict"
  | "denied"
  | "error"
  | "inactive"
  | "ready"
  | "submitting"
  | "uncertain"
  | "verifying";

export interface EmployeeShiftStartSnapshot {
  readonly failure: EmployeeOperationalFailure | null;
  readonly identityGeneration: number | null;
  readonly phase: EmployeeShiftStartPhase;
  readonly selectedLocationId: string | null;
  readonly startableLocations: readonly StaffOperationalLocation[];
  readonly targetLocationId: string | null;
}

export interface EmployeeShiftStartTransport {
  startShift(targetLocationId: string): Promise<StartShiftResponse>;
}

export interface EmployeeShiftStartSessionOptions {
  readonly onStateChange?:
    ((snapshot: EmployeeShiftStartSnapshot) => void) | undefined;
  readonly refreshOperationalContext: () => Promise<void>;
  readonly transport: EmployeeShiftStartTransport;
}

export interface EmployeeShiftStartContextObserver {
  observeOperationalContext(
    identityGeneration: number,
    response: StaffOperationalContextResponse,
  ): void;
}
