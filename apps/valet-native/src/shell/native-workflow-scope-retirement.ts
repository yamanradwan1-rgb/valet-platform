import type { NativeEmployeeRuntime } from "../auth/native-auth-runtime";

type ScopeRuntime = Pick<
  NativeEmployeeRuntime,
  | "checkIn"
  | "confirmParking"
  | "guestAccess"
  | "handoff"
  | "incident"
  | "parking"
  | "release"
  | "retrieval"
  | "shiftEnd"
  | "vehicleDirectory"
>;

/** Purges workflow state when the shell retires or changes authority scope. */
export function retireNativeWorkflowScope(runtime: ScopeRuntime): void {
  runtime.shiftEnd.fenceOperationalScope();
  runtime.checkIn.clear();
  runtime.confirmParking.clear();
  runtime.guestAccess.clear();
  runtime.handoff.clear();
  runtime.incident.clear();
  runtime.parking.clear();
  runtime.retrieval.clear();
  runtime.release.clear();
  runtime.vehicleDirectory.clear();
}
