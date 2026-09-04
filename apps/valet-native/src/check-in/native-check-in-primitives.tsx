import type { ReactNode } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import type {
  EmployeeCheckInAuthoritativeSession,
  EmployeeCheckInRecognizedVehicle,
  EmployeeCheckInRecoverable,
} from "@valet/employee-client";

import { checkInStyles as s } from "./native-check-in-styles";
import { checkInTextStyle } from "./native-check-in-presentation";

export type NativeTextAlign = "left" | "right";

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
    <Pressable
      accessibilityLabel={label}
      accessibilityRole={role}
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={onPress}
      style={[
        s.button,
        secondary && s.secondaryButton,
        disabled && s.buttonDisabled,
      ]}
    >
      <Text style={[s.buttonLabel, secondary && s.secondaryLabel]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function CheckInField({
  accessibilityLabel,
  inputMode,
  maxLength,
  onChangeText,
  placeholder,
  value,
  kind,
  textAlign,
  prefix,
}: {
  readonly accessibilityLabel: string;
  readonly inputMode?: "tel" | "text";
  readonly maxLength: number;
  readonly onChangeText: (value: string) => void;
  readonly placeholder?: string;
  readonly value: string;
  readonly kind: "identifier" | "human";
  readonly textAlign: NativeTextAlign;
  readonly prefix?: string;
}) {
  return (
    <View style={{ gap: 7 }}>
      <Text style={[s.fieldLabel, { textAlign }]}>{accessibilityLabel}</Text>
      <View style={{ flexDirection: "row", direction: "ltr", gap: 8 }}>
        {prefix ? (
          <Text
            style={[
              s.field,
              {
                textAlign: "left",
                writingDirection: "ltr",
                textAlignVertical: "center",
              },
            ]}
          >
            {prefix}
          </Text>
        ) : null}
        <TextInput
          accessibilityLabel={accessibilityLabel}
          autoCapitalize={kind === "identifier" ? "characters" : "sentences"}
          autoCorrect={false}
          inputMode={inputMode}
          maxLength={maxLength}
          onChangeText={onChangeText}
          placeholder={placeholder}
          style={[s.field, { flex: 1 }, checkInTextStyle(kind, textAlign)]}
          value={value}
        />
      </View>
    </View>
  );
}

export function CheckInError({
  children,
  textAlign,
}: {
  readonly children: ReactNode;
  readonly textAlign: NativeTextAlign;
}) {
  return (
    <Text accessibilityLiveRegion="assertive" style={[s.error, { textAlign }]}>
      {children}
    </Text>
  );
}

export function CheckInStatus({
  children,
  textAlign,
}: {
  readonly children: ReactNode;
  readonly textAlign: NativeTextAlign;
}) {
  return (
    <Text accessibilityLiveRegion="polite" style={[s.text, { textAlign }]}>
      {children}
    </Text>
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
    <View accessibilityLabel={`${name}, ${identifier}`} style={s.card}>
      <Text style={[s.title, { fontSize: 22, textAlign }]}>{name}</Text>
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
    </View>
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
      <Text style={s.badge}>{label}</Text>
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
