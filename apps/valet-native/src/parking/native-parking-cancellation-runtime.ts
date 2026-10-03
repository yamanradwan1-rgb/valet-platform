import {
  createEmployeeParkingCancellationTransport,
  EmployeeParkingCancellationSession,
  isSameEmployeeOperationalScope,
  type EmployeeConfirmParkedSession,
  type EmployeeOperationalSession,
  type EmployeeParkingStartSession,
  type NativeAuthSession,
} from "@valet/employee-client";
import { createNativeEmployeeClient } from "../tasks/native-operational-http";

export function createNativeParkingCancellation(
  apiOrigin: string,
  auth: NativeAuthSession,
  operations: EmployeeOperationalSession,
  parking: EmployeeParkingStartSession,
  confirmation: EmployeeConfirmParkedSession,
) {
  const cancellation = new EmployeeParkingCancellationSession({
    transport: createEmployeeParkingCancellationTransport(() =>
      createNativeEmployeeClient(apiOrigin, auth),
    ),
    isCurrent: (target) => {
      const identity = auth.current();
      const current = operations.current();
      const selected = parking.current();
      return (
        identity.phase === "authenticated" &&
        identity.authGeneration === target.identityGeneration &&
        current.phase === "ready" &&
        current.identityGeneration === target.identityGeneration &&
        current.scope !== null &&
        current.scope.role === target.scope.role &&
        isSameEmployeeOperationalScope(current.scope, target.scope) &&
        selected.identityGeneration === target.identityGeneration &&
        selected.task?.taskId === target.taskId &&
        selected.session?.sessionId === target.sessionId
      );
    },
    onCancelled: (result) => {
      parking.clear();
      confirmation.clear();
      void operations.retireTaskAfterTerminalMutation(result.taskId);
    },
  });
  operations.subscribe((current) => {
    const target = cancellation.current().target;
    if (!target) return;
    if (
      current.identityGeneration !== target.identityGeneration ||
      (current.scope !== null &&
        (current.scope.role !== target.scope.role ||
          !isSameEmployeeOperationalScope(current.scope, target.scope))) ||
      [
        "inactive",
        "no-active-shift",
        "access-denied",
        "no-usable-location",
        "ambiguous-active-shifts",
      ].includes(current.phase)
    )
      cancellation.clear();
  });
  parking.subscribe((current) => {
    const target = cancellation.current().target;
    if (
      target &&
      (current.identityGeneration !== target.identityGeneration ||
        current.task?.taskId !== target.taskId ||
        current.session?.sessionId !== target.sessionId)
    )
      cancellation.clear();
  });
  return cancellation;
}
