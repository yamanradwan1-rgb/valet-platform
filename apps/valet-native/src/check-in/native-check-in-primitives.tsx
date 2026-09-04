import { Pressable, Text, View } from "react-native";
import type {
  EmployeeCheckInAuthoritativeSession,
  EmployeeCheckInRecognizedVehicle,
  EmployeeCheckInRecoverable,
} from "@valet/employee-client";

import { checkInStyles as s } from "./native-check-in-styles";
import { checkInTextStyle } from "./native-check-in-presentation";
import { EmployeeButton } from "../employee-ui/employee-controls";
import {
  EmployeeField,
  type EmployeeFieldProps,
} from "../employee-ui/employee-fields";
import { EmployeeBadge, EmployeeCard } from "../employee-ui/employee-feedback";

import type { EmployeeTextAlign as NativeTextAlign } from "../employee-ui/employee-typography";
export type { EmployeeTextAlign as NativeTextAlign } from "../employee-ui/employee-typography";
export {
  EmployeeError as CheckInError,
  EmployeeStatus as CheckInStatus,
} from "../employee-ui/employee-feedback";

export function CheckInHeader({
  back,
  onBack,
  textAlign,
  title,
  disabled = false,
}: {
  readonly back: string;
  readonly onBack: () => void;
  readonly textAlign: NativeTextAlign;
  readonly title: string;
  readonly disabled?: boolean;
}) {
  return (
    <View style={s.header}>
      <Pressable
        accessibilityLabel={back}
        accessibilityRole="button"
        hitSlop={8}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => {
          if (!disabled) onBack();
        }}
        style={[s.headerButton, disabled && s.buttonDisabled]}
      >
        <Text style={s.headerButtonLabel}>{back}</Text>
      </Pressable>
      <Text accessibilityRole="header" style={[s.headerTitle, { textAlign }]}>
        {title}
      </Text>
    </View>
  );
}

export function CheckInButton({
  disabled = false,
  label,
  onPress,
  role = "button",
  secondary = false,
  selected,
}: {
  readonly disabled?: boolean;
  readonly label: string;
  readonly onPress: () => void;
  readonly role?: "button" | "tab";
  readonly secondary?: boolean;
  readonly selected?: boolean;
}) {
  return (
    <EmployeeButton
      label={label}
      role={role}
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={onPress}
      variant={secondary ? "secondary" : "primary"}
      size={role === "tab" ? "large" : secondary ? "standard" : "large"}
    />
  );
}

export function CheckInField(props: EmployeeFieldProps) {
  return (
    <EmployeeField
      {...props}
      visualRole={
        props.visualRole ??
        (props.prefix
          ? "phone"
          : props.kind === "identifier"
            ? "plate"
            : "standard")
      }
    />
  );
}

export function VehicleCard({
  fallback,
  textAlign,
  vehicle,
}: {
  readonly fallback: string;
  readonly textAlign: NativeTextAlign;
  readonly vehicle:
    | EmployeeCheckInAuthoritativeSession["vehicle"]
    | EmployeeCheckInRecognizedVehicle;
}) {
  const name =
    [vehicle.make, vehicle.model].filter(Boolean).join(" ") || fallback;
  const identifier =
    vehicle.plateNumberRaw ??
    ("temporaryDescriptor" in vehicle ? vehicle.temporaryDescriptor : null) ??
    fallback;
  return (
    <EmployeeCard accessibilityLabel={`${name}, ${identifier}`}>
      <Text style={[s.title, { textAlign }]}>{name}</Text>
      <Text
        style={[
          s.text,
          checkInTextStyle(
            vehicle.plateNumberRaw !== null ? "identifier" : "human",
            textAlign,
          ),
        ]}
      >
        {identifier}
      </Text>
      {vehicle.color ? (
        <Text style={[s.text, checkInTextStyle("human", textAlign)]}>
          {vehicle.color}
        </Text>
      ) : null}
    </EmployeeCard>
  );
}

export function RecoverableCard({
  label,
  onPress,
  recoverable,
  textAlign,
  vehicleFallback,
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly recoverable: EmployeeCheckInRecoverable;
  readonly textAlign: NativeTextAlign;
  readonly vehicleFallback: string;
}) {
  const vehicle = recoverable.value.vehicle;
  const name =
    [vehicle.make, vehicle.model].filter(Boolean).join(" ") || vehicleFallback;
  const identifier =
    vehicle.plateNumberRaw ?? vehicle.temporaryDescriptor ?? vehicleFallback;
  return (
    <Pressable
      accessibilityLabel={`${label}, ${name}, ${identifier}`}
      accessibilityRole="button"
      onPress={onPress}
      style={s.card}
    >
      <EmployeeBadge label={label} textAlign={textAlign} />
      <Text style={[s.title, { fontSize: 18, textAlign }]}>{name}</Text>
      <Text
        style={[
          s.text,
          checkInTextStyle(
            vehicle.plateNumberRaw !== null ? "identifier" : "human",
            textAlign,
          ),
        ]}
      >
        {identifier}
      </Text>
    </Pressable>
  );
}
