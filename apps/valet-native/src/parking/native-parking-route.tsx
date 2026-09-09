import { useState } from "react";
import type {
  EmployeeConfirmParkedSession,
  EmployeeConfirmParkedSnapshot,
  EmployeeParkingStartSnapshot,
  NativeAuthSession,
} from "@valet/employee-client";

import type { FoundationLocale } from "../foundation/foundation-locale";
import { NativeActiveParkingPanel } from "./native-active-parking-panel";
import { NativeParkingConfirmPanel } from "./native-parking-confirm-panel";
import { nativeOnlineHint } from "../shift/native-shift-connectivity";

export function NativeParkingRoute({
  auth,
  confirmation,
  confirmSnapshot,
  locale,
  onDone,
  parkingSnapshot,
}: {
  readonly auth: NativeAuthSession;
  readonly confirmation: EmployeeConfirmParkedSession;
  readonly confirmSnapshot: EmployeeConfirmParkedSnapshot;
  readonly locale: FoundationLocale;
  readonly onDone: () => void;
  readonly parkingSnapshot: EmployeeParkingStartSnapshot;
}) {
  const [showConfirmation, setShowConfirmation] = useState(false);
  if (!showConfirmation) {
    return (
      <NativeActiveParkingPanel
        locale={locale}
        onParkVehicle={() => setShowConfirmation(true)}
        snapshot={parkingSnapshot}
      />
    );
  }
  return (
    <NativeParkingConfirmPanel
      auth={auth}
      confirmation={confirmation}
      locale={locale}
      online={nativeOnlineHint()}
      onBack={() => setShowConfirmation(false)}
      onDone={onDone}
      snapshot={confirmSnapshot}
    />
  );
}
