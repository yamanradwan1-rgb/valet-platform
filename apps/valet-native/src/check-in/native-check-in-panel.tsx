import { useEffect, useState, useSyncExternalStore } from "react";
import { Modal } from "react-native";
import type {
  EmployeeCheckInSession,
  EmployeeLocale,
  EmployeeOperationalSnapshot,
  NativeAuthSession,
} from "@valet/employee-client";

import { NativeCheckInWorkflow } from "./native-check-in-workflow";
import { getNativeCheckInCopy } from "./native-check-in-copy";
import { checkInBackBlocked } from "./native-check-in-presentation";
import { nativeCheckInWorkflowOwner } from "./native-check-in-ownership";
import { EmployeeButton } from "../employee-ui/employee-controls";
import {
  EmployeeAppHeader,
  EmployeeFrame,
} from "../employee-ui/employee-frame";
import { EmployeePlusIcon } from "../employee-ui/employee-icons";

interface NativeCheckInPanelProps {
  readonly auth: NativeAuthSession;
  readonly checkIn: EmployeeCheckInSession;
  readonly locale: EmployeeLocale;
  readonly operations: EmployeeOperationalSnapshot;
}

export function NativeCheckInPanel({
  auth,
  checkIn,
  locale,
  operations,
}: NativeCheckInPanelProps) {
  const [open, setOpen] = useState(false);
  const snapshot = useSyncExternalStore(
    (listener) => checkIn.subscribe(listener),
    () => checkIn.current(),
  );
  useEffect(() => () => checkIn.clear(), [checkIn]);
  const scope = operations.scope;
  if (
    operations.phase !== "ready" ||
    scope === null ||
    operations.identityGeneration === null
  ) {
    return null;
  }
  const copy = getNativeCheckInCopy(locale);
  const textAlign = locale === "ar" ? "right" : "left";
  const close = () => {
    const current = checkIn.current();
    if (checkInBackBlocked(current.phase, current.continuation?.mode)) return;
    if (
      current.phase === "created" &&
      current.continuation !== undefined &&
      current.continuation.mode !== "view"
    ) {
      checkIn.cancelVehicleEdit();
      return;
    }
    checkIn.clear();
    setOpen(false);
  };
  const launch = () => {
    setOpen(true);
    void checkIn.activate(
      operations.identityGeneration!,
      scope.locationId,
      nativeCheckInWorkflowOwner(scope),
    );
  };
  return (
    <>
      <EmployeeButton
        label={copy.newVehicle}
        leading={<EmployeePlusIcon />}
        onPress={launch}
        size="compact"
        variant="primary"
      />
      <Modal
        animationType="slide"
        onRequestClose={close}
        presentationStyle="fullScreen"
        visible={open}
      >
        <EmployeeFrame direction={locale === "ar" ? "rtl" : "ltr"}>
          <EmployeeAppHeader
            scope={scope}
            textAlign={textAlign}
            utilities={null}
          />
          <NativeCheckInWorkflow
            auth={auth}
            locale={locale}
            onClose={close}
            session={checkIn}
            snapshot={snapshot}
            scope={scope}
          />
        </EmployeeFrame>
      </Modal>
    </>
  );
}
