import { useCallback, useEffect, useState } from "react";

import type { NativeLocalePreference } from "../i18n/native-locale-preference";
import { useNativeEmployeeLocale } from "../i18n/use-native-employee-locale";
import { useNativePushAttention } from "../notifications/use-native-push-attention";
import { useNativeProductionBackHandler } from "./native-production-back-handler";
import { useNativeContextualRoute } from "./use-native-contextual-route";
import { NativeProductionWorkspace } from "./native-production-workspace";
import { retireNativeWorkflowScope } from "./native-workflow-scope-retirement";
import { createNativeProductionBootstrap } from "./native-production-bootstrap";
import { NativeShellGate } from "./native-shell-gate";
import { NativeShiftDetachedScreen } from "../shift/native-shift-detached-screen";
import { shouldRenderDetachedShiftEnd } from "../shift/native-shift-protection";
import { useNativeVehicleDirectoryRevalidation } from "../vehicles/use-native-vehicle-directory-revalidation";
import { useNativeProductionLifecycle } from "./use-native-production-lifecycle";
import {
  ProductionShellController,
  type ProductionDestination,
  type ProductionRouteIntent,
} from "./production-shell-controller";
import {
  beginPhysicalMetric,
  classifyPhysicalBootstrap,
  observeOperationalReady,
} from "../diagnostics/native-physical-diagnostics";

export function NativeProductionShell({
  coldIntent = null,
  localePreference,
}: {
  readonly coldIntent?: ProductionRouteIntent | null;
  readonly localePreference?: NativeLocalePreference;
}) {
  const { locale, setLocale } = useNativeEmployeeLocale(localePreference);
  const [bootstrap] = useState(createNativeProductionBootstrap);
  const [authSnapshot, setAuthSnapshot] = useState(bootstrap.auth);
  useState(() => classifyPhysicalBootstrap(bootstrap.auth));
  const [confirmParking, setConfirmParking] = useState(
    bootstrap.confirmParking,
  );
  const [handoff, setHandoff] = useState(bootstrap.handoff);
  const [operations, setOperations] = useState(bootstrap.operations);
  const [parking, setParking] = useState(bootstrap.parking);
  const [retrieval, setRetrieval] = useState(bootstrap.retrieval);
  const [release, setRelease] = useState(bootstrap.release);
  const [shiftStart, setShiftStart] = useState(bootstrap.shiftStart);
  const [shiftEnd, setShiftEnd] = useState(bootstrap.shiftEnd);
  const [vehicleDirectory, setVehicleDirectory] = useState(
    bootstrap.vehicleDirectory,
  );
  const [controller] = useState(() => {
    const productionController = new ProductionShellController();
    if (coldIntent !== null) productionController.receive(coldIntent);
    return productionController;
  });
  const [, setNavigationRevision] = useState(0);
  const bumpNavigation = useCallback(
    () => setNavigationRevision((value) => value + 1),
    [],
  );
  const runtime = bootstrap.runtime;
  const contextual = useNativeContextualRoute(
    runtime,
    authSnapshot.authGeneration,
  );
  const onContextualBack = contextual.onSystemBack;
  const shell = controller.update(authSnapshot, operations);
  const activeVehicleScope =
    shell.kind === "active" && shell.destination === "vehicles"
      ? shell.scope
      : null;
  const workflowPurgeRevision = controller.currentWorkflowPurgeRevision();
  const connectivity = useNativeProductionLifecycle(runtime);
  const { push, response, retrievalAttention } = useNativePushAttention(
    runtime,
    authSnapshot,
    locale,
    operations,
    connectivity,
    controller,
    bumpNavigation,
  );
  useNativeVehicleDirectoryRevalidation({
    directory: runtime?.vehicleDirectory,
    identityGeneration: authSnapshot.authGeneration,
    scope: activeVehicleScope,
    snapshot: vehicleDirectory,
  });
  useEffect(() => {
    if (runtime === undefined) return;
    const unsubscribeAuth = runtime.auth.subscribe(setAuthSnapshot);
    const unsubscribeConfirmParking =
      runtime.confirmParking.subscribe(setConfirmParking);
    const unsubscribeHandoff = runtime.handoff.subscribe(setHandoff);
    const unsubscribeOperations = runtime.operations.subscribe(setOperations);
    const unsubscribeParking = runtime.parking.subscribe(setParking);
    const unsubscribeRetrieval = runtime.retrieval.subscribe(setRetrieval);
    const unsubscribeRelease = runtime.release.subscribe(setRelease);
    const unsubscribeShiftStart = runtime.shiftStart.subscribe(setShiftStart);
    const unsubscribeShiftEnd = runtime.shiftEnd.subscribe(setShiftEnd);
    const unsubscribeVehicleDirectory =
      runtime.vehicleDirectory.subscribe(setVehicleDirectory);
    void runtime.auth.start();
    return () => {
      unsubscribeAuth();
      unsubscribeConfirmParking();
      unsubscribeHandoff();
      unsubscribeOperations();
      unsubscribeParking();
      unsubscribeRetrieval();
      unsubscribeRelease();
      unsubscribeShiftStart();
      unsubscribeShiftEnd();
      unsubscribeVehicleDirectory();
      runtime.dispose();
    };
  }, [runtime]);
  useEffect(() => {
    observeOperationalReady(authSnapshot, operations);
  }, [authSnapshot, operations]);
  useEffect(() => {
    if (runtime === undefined) return;
    if (authSnapshot.phase === "authenticated") {
      runtime.shiftEnd.activate(authSnapshot.authGeneration);
      runtime.shiftStart.activate(authSnapshot.authGeneration);
      beginPhysicalMetric("task_list_ready_ms", "initial");
      void runtime.operations.activate(authSnapshot.authGeneration);
    } else {
      runtime.confirmParking.clear();
      runtime.handoff.clear();
      runtime.parking.clear();
      runtime.retrieval.clear();
      runtime.release.clear();
      runtime.shiftEnd.clear();
      runtime.shiftStart.clear();
      runtime.operations.clear();
      runtime.vehicleDirectory.clear();
    }
  }, [authSnapshot.authGeneration, authSnapshot.phase, runtime]);
  useEffect(() => {
    if (runtime === undefined || workflowPurgeRevision === 0) return;
    retireNativeWorkflowScope(runtime);
  }, [runtime, workflowPurgeRevision]);
  useEffect(() => {
    const activeTask = runtime?.handoff.current().task;
    if (
      runtime === undefined ||
      activeTask === null ||
      activeTask === undefined ||
      operations.phase !== "ready" ||
      operations.queueFailure !== null ||
      operations.queueLoading
    ) {
      return;
    }
    void runtime.handoff.observeTaskAuthority(
      operations.tasks.find((task) => task.taskId === activeTask.taskId),
    );
  }, [operations, runtime]);

  useEffect(() => {
    const activeTask = runtime?.release.current().task;
    if (
      runtime === undefined ||
      activeTask === null ||
      activeTask === undefined ||
      runtime.release.current().phase === "released" ||
      operations.phase !== "ready" ||
      operations.queueFailure !== null ||
      operations.queueLoading
    ) {
      return;
    }
    void runtime.release.observeTaskAuthority(
      operations.tasks.find((task) => task.taskId === activeTask.taskId),
    );
  }, [operations, runtime]);

  useEffect(() => {
    const task = parking.task;
    const session = parking.session;
    if (
      runtime === undefined ||
      parking.phase !== "started" ||
      parking.identityGeneration === null ||
      parking.scope === null ||
      task === null ||
      session === null ||
      runtime.parking.current() !== parking ||
      runtime.confirmParking.current().phase !== "inactive"
    )
      return;
    void runtime.confirmParking.open(
      parking.identityGeneration,
      parking.scope,
      task.taskId,
      session.sessionId,
    );
  }, [parking, runtime]);

  const navigate = (destination: ProductionDestination) => {
    if (destination === "tasks") {
      beginPhysicalMetric("task_list_ready_ms", "task-screen");
      observeOperationalReady(authSnapshot, operations);
    }
    controller.receive({ destination, source: "navigation" });
    setNavigationRevision((value) => value + 1);
  };
  useNativeProductionBackHandler(
    controller,
    runtime,
    shell,
    bumpNavigation,
    onContextualBack,
  );

  if (shell.kind !== "active" || runtime === undefined) {
    if (
      runtime !== undefined &&
      shouldRenderDetachedShiftEnd(authSnapshot, shiftEnd, shell.kind)
    ) {
      return (
        <NativeShiftDetachedScreen
          auth={runtime.auth}
          authSnapshot={authSnapshot}
          locale={locale}
          onReviewTasks={() => {
            controller.receive({ destination: "tasks", source: "navigation" });
            bumpNavigation();
            void runtime.operations.activate(authSnapshot.authGeneration);
          }}
          onSelectLocale={setLocale}
          session={runtime.shiftEnd}
          snapshot={shiftEnd}
        />
      );
    }
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
      contextual={contextual}
      locale={locale}
      handoff={handoff}
      confirmParking={confirmParking}
      connectivity={connectivity}
      navigate={navigate}
      onSelectLocale={setLocale}
      operations={operations}
      parking={parking}
      push={push}
      retrieval={retrieval}
      release={release}
      retrievalAttention={{
        ...retrievalAttention,
        openCurrentTaskQueue: response.openCurrentTaskQueue,
      }}
      runtime={runtime}
      shell={shell}
      vehicleDirectory={vehicleDirectory}
    />
  );
}
