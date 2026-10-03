import { useEmployeeStyles } from "../appearance/employee-appearance-context";
import { Text, TextInput, View } from "react-native";
import type {
  NativeAuthSession,
  QrResourceKind,
  QrResourcePayload,
} from "@valet/employee-client";

import { EmployeeButton } from "../employee-ui/employee-controls";
import { EmployeeStatus } from "../employee-ui/employee-feedback";
import { employeeTextStyle } from "../employee-ui/employee-typography";
import type { FoundationLocale } from "../foundation/foundation-locale";
import { NativeParkingQrInput } from "./native-parking-qr-input";
import { nativeParkingConfirmStylesTheme as sTheme } from "./native-parking-confirm-styles";

/** Shared open/closed scanner composition for Parking Spot and Key Slot. */
export function NativeParkingResourceCapture(props: {
  readonly auth: NativeAuthSession;
  readonly body: string;
  readonly disabled: boolean;
  readonly kind: QrResourceKind;
  readonly label: string;
  readonly locale: FoundationLocale;
  readonly manualLabel: string;
  readonly onCandidate: (value: string) => void;
  readonly onScanCandidate: (value: QrResourcePayload) => void;
  readonly onManual: () => void;
  readonly textAlign: "left" | "right";
  readonly title: string;
  readonly value: string;
}) {
  const s = useEmployeeStyles(sTheme);

  return (
    <>
      <Text style={[s.title, employeeTextStyle("human", props.textAlign)]}>
        {props.title}
      </Text>
      <EmployeeStatus textAlign={props.textAlign}>{props.body}</EmployeeStatus>
      <NativeParkingQrInput
        auth={props.auth}
        autoOpen
        disabled={props.disabled}
        kind={props.kind}
        label={props.label}
        locale={props.locale}
        manualInput={false}
        onChange={props.onCandidate}
        onResourceScan={props.onScanCandidate}
        value={props.value}
      />
      <EmployeeButton
        disabled={props.disabled}
        label={props.manualLabel}
        onPress={props.onManual}
        variant="secondary"
      />
    </>
  );
}

/** Shared result/confirmation card hierarchy for both parking resources. */
export function NativeParkingResourceResult(props: {
  readonly codeLabel: string;
  readonly label: string;
  readonly onChange: (value: string) => void;
  readonly placeholder: string;
  readonly value: string;
  readonly valueHero: string;
}) {
  const s = useEmployeeStyles(sTheme);

  return (
    <View style={s.successSurface}>
      <Text style={s.fieldLabel}>{props.label}</Text>
      <Text style={s.locationHero}>{props.valueHero}</Text>
      <Text style={s.fieldLabel}>{props.codeLabel}</Text>
      <TextInput
        accessibilityLabel={props.codeLabel}
        autoCapitalize="characters"
        autoCorrect={false}
        onChangeText={props.onChange}
        placeholder={props.placeholder}
        style={s.spotInput}
        value={props.value}
      />
    </View>
  );
}
