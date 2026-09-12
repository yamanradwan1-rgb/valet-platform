import { useState } from "react";
import type {
  EmployeeConnectivityStatus,
  EmployeeConfirmParkedSession,
  EmployeeConfirmParkedSnapshot,
  EmployeeParkingStartSnapshot,
  NativeAuthSession,
} from "@valet/employee-client";

import type { FoundationLocale } from "../foundation/foundation-locale";
import { NativeActiveParkingPanel } from "./native-active-parking-panel";
import { NativeParkingConfirmPanel } from "./native-parking-confirm-panel";

export function NativeParkingRoute({
  auth,
  connectivity,
  confirmation,
  confirmSnapshot,
  locale,
  onDone,
  onReportIssue,
  parkingSnapshot,
}: {
  readonly auth: NativeAuthSession;
  readonly connectivity: EmployeeConnectivityStatus;
  readonly confirmation: EmployeeConfirmParkedSession;
  readonly confirmSnapshot: EmployeeConfirmParkedSnapshot;
  readonly locale: FoundationLocale;
  readonly onDone: () => void;
  readonly onReportIssue?: ((sessionId: string) => void) | undefined;
  readonly parkingSnapshot: EmployeeParkingStartSnapshot;
}) {
  const [showConfirmation, setShowConfirmation] = useState(false);
  if (!showConfirmation) {
    return (
      <NativeActiveParkingPanel
        locale={locale}
        onParkVehicle={() => setShowConfirmation(true)}
        onReportIssue={onReportIssue}
        snapshot={parkingSnapshot}
      />
    );
  }
  return (
    <NativeParkingConfirmPanel
      auth={auth}
      confirmation={confirmation}
      locale={locale}
      online={connectivity !== "offline"}
      onBack={() => setShowConfirmation(false)}
      onDone={onDone}
      snapshot={confirmSnapshot}
    />
  );
}
