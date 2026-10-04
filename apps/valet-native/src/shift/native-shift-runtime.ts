import {
  EmployeeShiftEndSession,
  EmployeeShiftStartSession,
  type EmployeeOperationalSession,
  type EmployeeConnectivityOwner,
  type NativeAuthSession,
} from "@valet/employee-client";
import {
  createNativeShiftEndTransport,
  createNativeShiftStartTransport,
} from "../tasks/native-operational-http";
import {
  retireNativeShiftScope,
  type NativeShiftRetirementTargets,
} from "./native-shift-retirement";
import { createNativeShiftPresenceRuntime } from "./native-shift-presence-runtime";
import { AppState } from "react-native";

export function createNativeShiftRuntime(
  apiOrigin: string,
  auth: NativeAuthSession,
  operations: EmployeeOperationalSession,
  connectivity: EmployeeConnectivityOwner,
  targets: () => NativeShiftRetirementTargets,
) {
  const presence = createNativeShiftPresenceRuntime(
    apiOrigin,
    auth,
    () =>
      AppState.currentState === "active" &&
      connectivity.current() !== "offline",
  );
  const shiftStart = new EmployeeShiftStartSession({
    presence: presence.start,
    refreshOperationalContext: () => operations.refresh(),
    transport: createNativeShiftStartTransport(apiOrigin, auth),
  });
  const shiftEnd = new EmployeeShiftEndSession({
    presence: presence.end,
    initialOnline: connectivity.current() !== "offline",
    onEnded: () => {
      const identity = auth.current();
      if (identity.phase === "authenticated")
        retireNativeShiftScope(targets(), identity.authGeneration);
    },
    transport: createNativeShiftEndTransport(apiOrigin, auth),
  });
  presence.sessions.start = shiftStart;
  presence.sessions.end = shiftEnd;
  return { shiftStart, shiftEnd, presence };
}
