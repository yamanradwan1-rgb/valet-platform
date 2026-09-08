import type {
  EmployeeConfirmParkedPhase,
  EmployeeParkingStartPhase,
} from "@valet/employee-client";

export function nativeParkingBackBlocked(
  startPhase: EmployeeParkingStartPhase,
  confirmPhase: EmployeeConfirmParkedPhase,
): boolean {
  return (
    startPhase === "submitting" ||
    startPhase === "reconciling" ||
    confirmPhase === "submitting" ||
    confirmPhase === "reconciling"
  );
}
