import { useEffect, useState, useSyncExternalStore } from "react";
import { Modal, Pressable, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type {
  EmployeeCheckInSession,
  EmployeeLocale,
  EmployeeOperationalSnapshot,
  NativeAuthSession,
} from "@valet/employee-client";

import { NativeCheckInWorkflow } from "./native-check-in-workflow";
import { getNativeCheckInCopy } from "./native-check-in-copy";
import { checkInStyles as s } from "./native-check-in-styles";
import { checkInBackBlocked } from "./native-check-in-presentation";

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
  if (
    operations.phase !== "ready" ||
    operations.scope === null ||
    operations.identityGeneration === null
  ) {
    return null;
  }
  const copy = getNativeCheckInCopy(locale);
  const close = () => {
    if (checkInBackBlocked(checkIn.current().phase)) return;
    checkIn.clear();
    setOpen(false);
  };
  const launch = () => {
    setOpen(true);
    void checkIn.activate(
      operations.identityGeneration!,
      operations.scope!.locationId,
    );
  };
  return (
    <>
      <Pressable
        accessibilityLabel={copy.title}
        accessibilityRole="button"
        onPress={launch}
        style={s.button}
      >
        <Text style={s.buttonLabel}>{copy.title}</Text>
      </Pressable>
      <Modal
        animationType="slide"
        onRequestClose={close}
        presentationStyle="fullScreen"
        visible={open}
      >
        <SafeAreaView style={s.modal}>
          <NativeCheckInWorkflow
            auth={auth}
            locale={locale}
            onClose={close}
            session={checkIn}
            snapshot={snapshot}
          />
        </SafeAreaView>
      </Modal>
    </>
  );
}
