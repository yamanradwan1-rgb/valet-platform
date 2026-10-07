import { useEffect, useState } from "react";
import { View } from "react-native";

import { EmployeeButton } from "../employee-ui/employee-controls";
import {
  EmployeeError,
  EmployeeStatus,
} from "../employee-ui/employee-feedback";
import type { FoundationLocale } from "../foundation/foundation-locale";
import type { NativeTaskTrackingRuntime } from "./native-task-tracking-runtime";
import { getNativeTaskTrackingCopy } from "./native-task-tracking-copy";

export function NativeTaskTrackingStatus({
  locale,
  runtime,
}: {
  readonly locale: FoundationLocale;
  readonly runtime: NativeTaskTrackingRuntime;
}) {
  const [status, setStatus] = useState(runtime.current());
  useEffect(() => runtime.subscribe(setStatus), [runtime]);
  const copy = getNativeTaskTrackingCopy(locale);
  const textAlign = locale === "ar" ? "right" : "left";

  if (status.kind === "idle" || status.kind === "checking" || status.kind === "offline") {
    return null;
  }
  if (status.kind === "active") {
    return (
      <EmployeeStatus textAlign={textAlign}>
        {status.taskType === "PARKING" ? copy.activeParking : copy.activeRetrieval}
      </EmployeeStatus>
    );
  }
  const message =
    status.kind === "ambiguous"
      ? copy.ambiguous
      : status.kind === "permission-denied"
        ? copy.permissionDenied
        : status.kind === "permission-blocked"
          ? copy.permissionBlocked
          : status.kind === "services-disabled"
            ? copy.servicesDisabled
            : copy.unavailable;
  return (
    <View style={{ gap: 8 }}>
      <EmployeeError textAlign={textAlign}>{message}</EmployeeError>
      {status.kind === "permission-blocked" || status.kind === "services-disabled" ? (
        <EmployeeButton
          label={copy.openSettings}
          onPress={() => void runtime.openSettings()}
          variant="secondary"
        />
      ) : status.kind === "permission-denied" || status.kind === "unavailable" ? (
        <EmployeeButton label={copy.retry} onPress={() => runtime.retry()} variant="secondary" />
      ) : null}
    </View>
  );
}
