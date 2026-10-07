import type { NativeEmployeeRuntime } from "../auth/native-auth-runtime";

type ScopeRuntime = Pick<
  NativeEmployeeRuntime,
  | "checkInActions"
  | "checkIn"
  | "confirmParking"
  | "guestAccess"
  | "handoff"
  | "incident"
  | "parking"
  | "parkingCancellation"
  | "release"
  | "retrieval"
  | "shiftEnd"
  | "taskTracking"
  | "vehicleDirectory"
>;

/** Purges workflow state when the shell retires or changes authority scope. */
export function retireNativeWorkflowScope(runtime: ScopeRuntime): void {
  runtime.taskTracking.clear();
  runtime.shiftEnd.fenceOperationalScope();
  runtime.checkIn.clear();
  runtime.checkInActions.clear();
  runtime.confirmParking.clear();
  runtime.guestAccess.clear();
  runtime.handoff.clear();
  runtime.incident.clear();
  runtime.parking.clear();
  runtime.parkingCancellation?.clear();
  runtime.retrieval.clear();
  runtime.release.clear();
  runtime.vehicleDirectory.clear();
}
