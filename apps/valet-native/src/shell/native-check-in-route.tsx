import { useEffect, useSyncExternalStore } from "react";
import type {
  EmployeeCheckInSession,
  EmployeeLocale,
  EmployeeOperationalScope,
  NativeAuthSession,
} from "@valet/employee-client";

import { NativeCheckInWorkflow } from "../check-in/native-check-in-workflow";

export function NativeCheckInRoute({
  auth,
  checkIn,
  identityGeneration,
  locale,
  onClose,
  scope,
}: {
  readonly auth: NativeAuthSession;
  readonly checkIn: EmployeeCheckInSession;
  readonly identityGeneration: number;
  readonly locale: EmployeeLocale;
  readonly onClose: () => void;
  readonly scope: EmployeeOperationalScope;
}) {
  const snapshot = useSyncExternalStore(
    (listener) => checkIn.subscribe(listener),
    () => checkIn.current(),
  );

  useEffect(() => {
    void checkIn.activate(identityGeneration, scope.locationId);
    return () => checkIn.clear();
  }, [checkIn, identityGeneration, scope.locationId]);

  const close = () => {
    checkIn.clear();
    onClose();
  };

  return (
    <NativeCheckInWorkflow
      auth={auth}
      locale={locale}
      onClose={close}
      session={checkIn}
      snapshot={snapshot}
    />
  );
}
