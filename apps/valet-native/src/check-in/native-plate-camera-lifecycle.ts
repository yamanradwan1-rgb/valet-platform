import type { EmployeeCheckInSession } from "@valet/employee-client";
import { bindNativeQrLifecycle } from "../scanner/native-qr-lifecycle";
import type { NativePlateCameraController } from "./native-plate-camera-controller";
import { isNativeCameraPermissionRequestPending } from "../scanner/native-camera-permission-lifecycle";

/** Reuse MOB-009 auth/identity/AppState fences, plus exact Check-In scope. */
export function bindNativePlateCameraLifecycle(
  controller: NativePlateCameraController,
  session: EmployeeCheckInSession,
  ports: Parameters<typeof bindNativeQrLifecycle>[1],
): () => void {
  const initial = session.current();
  controller.trace.state(ports.appState.currentState, false);
  let eligible = false;
  let invalidated = false;
  const reconcile = () => {
    const current = session.current();
    const wasInvalidated = invalidated;
    invalidated ||=
      current.phase !== "capture" ||
      current.identityGeneration !== initial.identityGeneration ||
      current.locationId !== initial.locationId;
    if (!wasInvalidated && invalidated)
      controller.trace.record("workflow-retired");
    controller.setEligible(eligible && !invalidated);
  };
  const dispose = bindNativeQrLifecycle(
    {
      setEligible: (value) => {
        if (
          eligible !== value &&
          (value || ports.appState.currentState !== "active")
        )
          controller.trace.record(
            value ? "foreground-eligible" : "background-invalidation",
          );
        eligible = value;
        reconcile();
      },
    },
    {
      ...ports,
      appState: {
        get currentState() {
          return ports.appState.currentState;
        },
        addEventListener: (event, listener) =>
          ports.appState.addEventListener(event, (state) => {
            controller.trace.state(
              state,
              state !== "active" && isNativeCameraPermissionRequestPending(),
            );
            listener(state);
          }),
      },
    },
  );
  const unsubscribe = session.subscribe(reconcile);
  return () => {
    controller.trace.record("lifecycle-cleanup");
    if (!invalidated) controller.trace.record("workflow-retired");
    invalidated = true;
    dispose();
    unsubscribe();
  };
}
