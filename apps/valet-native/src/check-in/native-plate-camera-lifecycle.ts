import type { EmployeeCheckInSession } from "@valet/employee-client";
import { bindNativeQrLifecycle } from "../scanner/native-qr-lifecycle";
import type { NativePlateCameraController } from "./native-plate-camera-controller";

/** Reuse MOB-009 auth/identity/AppState fences, plus exact Check-In scope. */
export function bindNativePlateCameraLifecycle(
  controller: NativePlateCameraController,
  session: EmployeeCheckInSession,
  ports: Parameters<typeof bindNativeQrLifecycle>[1],
): () => void {
  const initial = session.current();
  let eligible = false;
  let invalidated = false;
  const reconcile = () => {
    const current = session.current();
    invalidated ||=
      current.phase !== "capture" ||
      current.identityGeneration !== initial.identityGeneration ||
      current.locationId !== initial.locationId;
    controller.setEligible(eligible && !invalidated);
  };
  const dispose = bindNativeQrLifecycle(
    {
      setEligible: (value) => {
        eligible = value;
        reconcile();
      },
    },
    ports,
  );
  const unsubscribe = session.subscribe(reconcile);
  return () => {
    invalidated = true;
    dispose();
    unsubscribe();
  };
}
