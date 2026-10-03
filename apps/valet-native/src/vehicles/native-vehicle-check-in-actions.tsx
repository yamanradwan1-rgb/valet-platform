import { Text, View, useWindowDimensions } from "react-native";
import { EmployeeButton } from "../employee-ui/employee-controls";
import { employeeTextStyle } from "../employee-ui/employee-typography";
import { nativeVehicleRowStyles } from "./native-vehicle-row-styles";
import type { nativeCheckInActionsCopy } from "./native-check-in-actions-copy";
import type { EmployeeCancelCheckInPhase } from "@valet/employee-client";

export function NativeVehicleCheckInActions({
  copy,
  phase,
  disabled,
  onContinue,
  onCancel,
  onCheck,
  onRetry,
  textAlign,
}: {
  readonly copy: ReturnType<typeof nativeCheckInActionsCopy>;
  readonly phase: EmployeeCancelCheckInPhase;
  readonly disabled: boolean;
  readonly onContinue: () => void;
  readonly onCancel: () => void;
  readonly onCheck: () => void;
  readonly onRetry: () => void;
  readonly textAlign: "left" | "right";
}) {
  const { fontScale } = useWindowDimensions();
  const actionHeight = Math.ceil(64 * Math.max(1, fontScale));
  const busy = ["preparing", "submitting", "reconciling", "confirm"].includes(
    phase,
  );
  const unresolved = ["unknown", "retry-available"].includes(phase);
  const message =
    phase === "preparing"
      ? copy.preparing
      : phase === "submitting"
        ? copy.submitting
        : phase === "unknown" || phase === "reconciling"
          ? copy.unknown
          : phase === "conflict"
            ? copy.conflict
            : phase === "unavailable"
              ? copy.unavailable
              : phase === "cancelled"
                ? copy.success
                : copy.incomplete;
  return (
    <View style={{ gap: 12 }} testID="native-vehicle-check-in-actions">
      <Text
        accessibilityLiveRegion="polite"
        style={[
          nativeVehicleRowStyles.readOnly,
          employeeTextStyle("human", textAlign),
        ]}
      >
        {message}
      </Text>
      <EmployeeButton
        height={actionHeight}
        disabled={disabled || busy || unresolved}
        label={copy.continue}
        onPress={onContinue}
        size="standard"
        variant="secondary"
      />
      <EmployeeButton
        height={actionHeight}
        disabled={disabled || busy || unresolved}
        label={copy.cancel}
        onPress={onCancel}
        size="standard"
        variant="danger"
      />
      {phase === "unknown" ? (
        <EmployeeButton
          height={actionHeight}
          disabled={disabled}
          label={copy.check}
          onPress={onCheck}
          size="standard"
          variant="secondary"
        />
      ) : null}
      {phase === "retry-available" ? (
        <EmployeeButton
          height={actionHeight}
          disabled={disabled}
          label={copy.retry}
          onPress={onRetry}
          size="standard"
          variant="secondary"
        />
      ) : null}
    </View>
  );
}
