import type {
  CancelBeforeParkingRequest,
  CancelBeforeParkingResponse,
  ParkingCancellationStatusResponse,
} from "@valet/contracts";
import type { EmployeeOperationalScope } from "./employee-operational-types";

export interface EmployeeParkingCancellationTarget extends CancelBeforeParkingRequest {
  readonly identityGeneration: number;
  readonly scope: EmployeeOperationalScope;
  readonly sessionId: string;
}
export type EmployeeParkingCancellationPhase =
  | "idle"
  | "confirming"
  | "submitting"
  | "uncertain"
  | "reconciling"
  | "cancelled"
  | "retry"
  | "conflict"
  | "error";
export interface EmployeeParkingCancellationSnapshot {
  readonly phase: EmployeeParkingCancellationPhase;
  readonly target: EmployeeParkingCancellationTarget | null;
}
export interface EmployeeParkingCancellationTransport {
  cancel(
    target: EmployeeParkingCancellationTarget,
  ): Promise<CancelBeforeParkingResponse>;
  status(
    target: EmployeeParkingCancellationTarget,
  ): Promise<ParkingCancellationStatusResponse>;
}
export interface EmployeeParkingCancellationOptions {
  readonly transport: EmployeeParkingCancellationTransport;
  readonly isCurrent: (target: EmployeeParkingCancellationTarget) => boolean;
  readonly onCancelled: (result: CancelBeforeParkingResponse) => void;
}
