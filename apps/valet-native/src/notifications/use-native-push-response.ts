import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import type {
  EmployeeOperationalSnapshot,
  NativeAuthSnapshot,
} from "@valet/employee-client";

import { nativeIdentityState } from "../auth/identity-state-boundary";
import type { NativeEmployeeRuntime } from "../auth/native-auth-runtime";
import type { ProductionShellController } from "../shell/production-shell-controller";
import { nativePushResponseCapture } from "./native-push-response-bootstrap";
import { NativePushRouteCoordinator } from "./native-push-route-coordinator";

export function useNativePushResponse(input: {
  readonly auth: NativeAuthSnapshot;
  readonly controller: ProductionShellController;
  readonly onRoute: () => void;
  readonly operations: EmployeeOperationalSnapshot;
  readonly runtime: NativeEmployeeRuntime | undefined;
}) {
  const hadReadFailure = useRef(false);
  const lastOperationsGeneration = useRef(input.operations.identityGeneration);
  const lastQueueSnapshotCount = useRef(
    input.operations.successfulQueueSnapshotCount,
  );
  const [coordinator] = useState(() =>
    input.runtime === undefined
      ? undefined
      : new NativePushRouteCoordinator({
          auth: input.auth,
          operations: input.runtime.operations,
          routeTasks: () => {
            const receipt = input.controller.receive({
              destination: "tasks",
              source: "notification",
            });
            if (receipt !== "rejected") input.onRoute();
            return receipt;
          },
        }),
  );

  useEffect(() => {
    if (coordinator === undefined) return;
    const unsubscribeResponse = nativePushResponseCapture.subscribe((intent) =>
      coordinator.receive(intent),
    );
    const unregisterPurge = nativeIdentityState.register(() =>
      coordinator.purgeIdentityScoped(),
    );
    return () => {
      unsubscribeResponse();
      unregisterPurge();
      coordinator.dispose();
    };
  }, [coordinator]);

  useEffect(() => coordinator?.setAuth(input.auth), [coordinator, input.auth]);

  useEffect(() => {
    if (coordinator === undefined) return;
    coordinator.setForeground(AppState.currentState === "active");
    const subscription = AppState.addEventListener("change", (state) =>
      coordinator.setForeground(state === "active"),
    );
    return () => subscription.remove();
  }, [coordinator]);

  useEffect(() => {
    const failed =
      input.operations.contextFailure !== null ||
      input.operations.queueFailure !== null;
    const generationChanged =
      input.operations.identityGeneration !== lastOperationsGeneration.current;
    const queueAdvanced =
      input.operations.successfulQueueSnapshotCount >
      lastQueueSnapshotCount.current;
    if (
      generationChanged ||
      queueAdvanced ||
      (!failed && hadReadFailure.current)
    )
      coordinator?.retry();
    hadReadFailure.current = failed;
    lastOperationsGeneration.current = input.operations.identityGeneration;
    lastQueueSnapshotCount.current =
      input.operations.successfulQueueSnapshotCount;
  }, [coordinator, input.operations]);

  return {
    openCurrentTaskQueue: () => coordinator?.requestForegroundOpen(),
  } as const;
}
