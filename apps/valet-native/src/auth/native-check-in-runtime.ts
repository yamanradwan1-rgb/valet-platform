import {
  createEmployeeCheckInTransport,
  createEmployeeCancelCheckInTransport,
  createEmployeeVehicleDirectoryTransport,
  EmployeeCheckInSession,
  EmployeeCancelCheckInSession,
  EmployeeVehicleDirectorySession,
  type EmployeeOperationalSession,
  type NativeAuthSession,
} from "@valet/employee-client";
import { createNativeEmployeeClient } from "../tasks/native-operational-http";
import { NativeCheckInActions } from "../check-in/native-check-in-actions";

export function createNativeCheckInRuntime(
  apiOrigin: string,
  auth: NativeAuthSession,
  operations: EmployeeOperationalSession,
  isOnline: () => boolean,
) {
  const checkIn = new EmployeeCheckInSession({
    createOperationId: createNativeOperationId,
    transport: createEmployeeCheckInTransport(() =>
      createNativeEmployeeClient(apiOrigin, auth),
    ),
  });
  const vehicleDirectory = new EmployeeVehicleDirectorySession({
    transport: createEmployeeVehicleDirectoryTransport(
      (signal) => createNativeEmployeeClient(apiOrigin, auth, signal),
      { checkInActions: true },
    ),
  });
  const cancelSession = new EmployeeCancelCheckInSession(
    createEmployeeCancelCheckInTransport(() =>
      createNativeEmployeeClient(apiOrigin, auth),
    ),
    (sessionId) => {
      if (checkIn.current().active?.sessionId === sessionId) checkIn.clear();
      void vehicleDirectory.refresh();
    },
  );
  return {
    checkIn,
    vehicleDirectory,
    checkInActions: new NativeCheckInActions(
      cancelSession,
      checkIn,
      vehicleDirectory,
      auth,
      operations,
      isOnline,
    ),
  };
}

function createNativeOperationId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function")
    return globalThis.crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (value) => {
    const random = Math.floor(Math.random() * 16);
    return (value === "x" ? random : (random & 0x3) | 0x8).toString(16);
  });
}
