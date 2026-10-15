import { useEffect, useSyncExternalStore } from "react";
import type {
  EmployeeCheckInSession,
  EmployeeLocale,
  EmployeeOperationalScope,
  NativeAuthSession,
} from "@valet/employee-client";

import { NativeCheckInWorkflow } from "../check-in/native-check-in-workflow";
import { nativeCheckInWorkflowOwner } from "../check-in/native-check-in-ownership";
import {
  beginPhysicalMetric,
  finishPhysicalMetric,
} from "../diagnostics/native-physical-diagnostics";

export function NativeCheckInRoute({
  auth,
  checkIn,
  identityGeneration,
  locale,
  onClose,
  onOpenGuestAccess,
  onOpenParking,
  scope,
}: {
  readonly auth: NativeAuthSession;
  readonly checkIn: EmployeeCheckInSession;
  readonly identityGeneration: number;
  readonly locale: EmployeeLocale;
  readonly onClose: () => void;
  readonly onOpenGuestAccess?: ((sessionId: string) => void) | undefined;
  readonly onOpenParking: (sessionId: string) => Promise<boolean>;
  readonly scope: EmployeeOperationalScope;
}) {
  const workflowOwner = nativeCheckInWorkflowOwner(scope);
  const snapshot = useSyncExternalStore(
    (listener) => checkIn.subscribe(listener),
    () => checkIn.current(),
  );

  useEffect(() => {
    beginPhysicalMetric("check_in_field_time_ms", "operator-flow");
    void checkIn.activate(identityGeneration, scope.locationId, workflowOwner);
    return () =>
      finishPhysicalMetric("check_in_field_time_ms", "failure", "cancelled");
  }, [checkIn, identityGeneration, scope.locationId, workflowOwner]);

  useEffect(() => {
    if (snapshot.phase === "continuation")
      finishPhysicalMetric("check_in_field_time_ms", "success");
  }, [snapshot.phase]);

  const close = () => {
    checkIn.clear();
    onClose();
  };

  return (
    <NativeCheckInWorkflow
      auth={auth}
      locale={locale}
      onClose={close}
      onOpenGuestAccess={onOpenGuestAccess}
      onOpenParking={onOpenParking}
      session={checkIn}
      snapshot={snapshot}
      scope={scope}
    />
  );
}
