import type {
  EndShiftResponse,
  StaffOperationalContextResponse,
  StaffOperationalRole,
} from "@valet/contracts";

import type { EmployeeOperationalFailure } from "./employee-operational-types";

export interface EmployeeShiftEndAuthority {
  readonly currency: string;
  readonly identityGeneration: number;
  readonly locationCode: string;
  readonly locationId: string;
  readonly locationName: string;
  readonly membershipId: string;
  readonly organizationId: string;
  readonly organizationName: string;
  readonly role: StaffOperationalRole;
  readonly shiftId: string;
  readonly shiftStartedAt: string;
}

export type EmployeeShiftEndPhase =
  | "active"
  | "blocked-open-work"
  | "confirming"
  | "ended"
  | "error"
  | "inactive"
  | "submitting"
  | "uncertain";

export interface EmployeeShiftEndSnapshot {
  readonly authority: EmployeeShiftEndAuthority | null;
  readonly cashInput: string;
  readonly cashValidationVisible: boolean;
  readonly failure: EmployeeOperationalFailure | null;
  readonly identityGeneration: number | null;
  readonly online: boolean;
  readonly phase: EmployeeShiftEndPhase;
  readonly result: EndShiftResponse | null;
}

export interface EmployeeShiftEndTransport {
  endShift(shiftId: string, cashReported: string): Promise<EndShiftResponse>;
}

export interface EmployeeShiftEndSessionOptions {
  readonly initialOnline?: boolean | undefined;
  readonly onEnded?: ((result: EndShiftResponse) => void) | undefined;
  readonly onStateChange?:
    ((snapshot: EmployeeShiftEndSnapshot) => void) | undefined;
  readonly transport: EmployeeShiftEndTransport;
}

export interface EmployeeShiftEndContextObserver {
  observeOperationalContext(
    identityGeneration: number,
    response: StaffOperationalContextResponse,
  ): void;
}
