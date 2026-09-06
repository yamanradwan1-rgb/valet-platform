import { useEffect, useState } from "react";
import type {
  EmployeeOperationalSnapshot,
  EmployeeShiftStartSnapshot,
  NativeAuthSnapshot,
} from "@valet/employee-client";
import { AppState, BackHandler } from "react-native";

import {
  createNativeEmployeeRuntime,
  type NativeEmployeeRuntime,
} from "../auth/native-auth-runtime";
import { checkInBackBlocked } from "../check-in/native-check-in-presentation";
import type { FoundationLocale } from "../foundation/foundation-locale";
import { useNativeRetrievalAttention } from "../tasks/use-native-retrieval-attention";
import { NativeProductionWorkspace } from "./native-production-workspace";
import { NativeShellGate } from "./native-shell-gate";
import {
  ProductionShellController,
  type ProductionDestination,
  type ProductionRouteIntent,
} from "./production-shell-controller";

interface Bootstrap {
  readonly auth: NativeAuthSnapshot;
  readonly operations: EmployeeOperationalSnapshot;
  readonly runtime: NativeEmployeeRuntime | undefined;
  readonly shiftStart: EmployeeShiftStartSnapshot;
}

function createBootstrap(): Bootstrap {
  try {
    const runtime = createNativeEmployeeRuntime();
    return {
      auth: runtime.auth.current(),
      operations: runtime.operations.current(),
      runtime,
      shiftStart: runtime.shiftStart.current(),
    };
  } catch {
    return {
      auth: {
        authGeneration: 0,
        phase: "fatal",
        reason: "configuration-failure",
      },
      operations: {
        contextFailure: null,
        identityGeneration: null,
        mutation: { phase: "idle" },
        phase: "inactive",
        queueFailure: null,
        queueHardStopped: false,
        queueLoading: false,
        queueRefreshing: false,
        scope: null,
        successfulQueueSnapshotCount: 0,
        tasks: [],
      },
      runtime: undefined,
      shiftStart: {
        failure: null,
        identityGeneration: null,
        phase: "inactive",
        selectedLocationId: null,
        startableLocations: [],
        targetLocationId: null,
      },
    };
  }
}

export function NativeProductionShell({
  coldIntent = null,
}: {
  readonly coldIntent?: ProductionRouteIntent | null;
}) {
  const [locale, setLocale] = useState<FoundationLocale>("en");
  const [bootstrap] = useState(createBootstrap);
  const [authSnapshot, setAuthSnapshot] = useState(bootstrap.auth);
  const [operations, setOperations] = useState(bootstrap.operations);
  const [shiftStart, setShiftStart] = useState(bootstrap.shiftStart);
  const [controller] = useState(() => {
    const productionController = new ProductionShellController();
    if (coldIntent !== null) productionController.receive(coldIntent);
    return productionController;
  });
  const [, setNavigationRevision] = useState(0);
  const runtime = bootstrap.runtime;
  const shell = controller.update(authSnapshot, operations);
  const workflowPurgeRevision = controller.currentWorkflowPurgeRevision();
  const retrievalAttention = useNativeRetrievalAttention(operations);

  useEffect(() => {
    if (runtime === undefined) return;
    const unsubscribeAuth = runtime.auth.subscribe(setAuthSnapshot);
    const unsubscribeOperations = runtime.operations.subscribe(setOperations);
    const unsubscribeShiftStart = runtime.shiftStart.subscribe(setShiftStart);
    void runtime.auth.start();
    return () => {
      unsubscribeAuth();
      unsubscribeOperations();
      unsubscribeShiftStart();
      runtime.dispose();
    };
  }, [runtime]);

  useEffect(() => {
    if (runtime === undefined) return;
    if (authSnapshot.phase === "authenticated") {
      runtime.shiftStart.activate(authSnapshot.authGeneration);
      void runtime.operations.activate(authSnapshot.authGeneration);
    } else {
      runtime.shiftStart.clear();
      runtime.operations.clear();
    }
  }, [authSnapshot.authGeneration, authSnapshot.phase, runtime]);

  useEffect(() => {
    if (runtime === undefined || workflowPurgeRevision === 0) return;
    runtime.checkIn.clear();
  }, [runtime, workflowPurgeRevision]);

  useEffect(() => {
    if (runtime === undefined) return;
    void runtime.operations.setForeground(AppState.currentState === "active");
    const subscription = AppState.addEventListener("change", (state) => {
      void runtime.operations.setForeground(state === "active");
    });
    return () => {
      subscription.remove();
      void runtime.operations.setForeground(false);
    };
  }, [runtime]);

  const navigate = (destination: ProductionDestination) => {
    controller.receive({ destination, source: "navigation" });
    setNavigationRevision((value) => value + 1);
  };

  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        if (shell.kind !== "active" || shell.destination === "tasks") {
          return false;
        }
        if (
          runtime !== undefined &&
          shell.destination === "check-in" &&
          checkInBackBlocked(
            runtime.checkIn.current().phase,
            runtime.checkIn.current().continuation?.mode,
          )
        ) {
          return true;
        }
        if (
          runtime !== undefined &&
          shell.destination === "check-in" &&
          runtime.checkIn.current().phase === "created" &&
          runtime.checkIn.current().continuation?.mode !== "view"
        ) {
          runtime.checkIn.cancelVehicleEdit();
          return true;
        }
        runtime?.checkIn.clear();
        const handled = controller.back();
        if (handled) setNavigationRevision((value) => value + 1);
        return handled;
      },
    );
    return () => subscription.remove();
  }, [controller, runtime, shell]);

  if (shell.kind !== "active" || runtime === undefined) {
    return (
      <NativeShellGate
        auth={runtime?.auth}
        authSnapshot={authSnapshot}
        locale={locale}
        onRetryContext={() => void runtime?.operations.refresh()}
        onSelectLocale={setLocale}
        onSignOut={() => void runtime?.auth.logout()}
        shiftStart={runtime?.shiftStart}
        shiftStartSnapshot={shiftStart}
        state={shell.kind === "active" ? { kind: "auth-error" } : shell}
      />
    );
  }

  return (
    <NativeProductionWorkspace
      authSnapshot={authSnapshot}
      locale={locale}
      navigate={navigate}
      onSelectLocale={setLocale}
      operations={operations}
      retrievalAttention={retrievalAttention}
      runtime={runtime}
      shell={shell}
    />
  );
}
