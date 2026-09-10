import { useEffect, useSyncExternalStore } from "react";
import type {
  EmployeeCheckInSession,
  EmployeeLocale,
  EmployeeOperationalScope,
  NativeAuthSession,
} from "@valet/employee-client";

import { NativeCheckInWorkflow } from "../check-in/native-check-in-workflow";
import { nativeCheckInWorkflowOwner } from "../check-in/native-check-in-ownership";

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
    void checkIn.activate(identityGeneration, scope.locationId, workflowOwner);
  }, [checkIn, identityGeneration, scope.locationId, workflowOwner]);

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
    />
  );
}
