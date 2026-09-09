import { StyleSheet, Text, TextInput, View } from "react-native";

import {
  employeeColors as c,
  employeeFieldHeights,
  employeeRadius,
  employeeSpacing,
} from "./employee-tokens";
import {
  employeeTextStyle,
  employeeTypography,
  type EmployeeTextAlign,
  type EmployeeTextKind,
} from "./employee-typography";

export const employeeFieldStyles = StyleSheet.create({
  field: {
    backgroundColor: c.white,
    borderColor: c.border,
    borderRadius: employeeRadius.form,
    borderWidth: 1,
    color: c.navy,
    ...employeeTypography.body,
    paddingHorizontal: employeeSpacing.lg,
    paddingVertical: employeeSpacing.sm,
  },
  label: { ...employeeTypography.label, color: c.navy },
});

export interface EmployeeFieldProps {
  readonly accessibilityLabel: string;
  readonly inputMode?: "tel" | "text";
  readonly maxLength: number;
  readonly onChangeText: (value: string) => void;
  readonly placeholder?: string;
  readonly value: string;
  readonly kind: EmployeeTextKind;
  readonly textAlign: EmployeeTextAlign;
  readonly prefix?: string;
  readonly size?: keyof typeof employeeFieldHeights;
  readonly textRole?: "body" | "phone" | "value";
  /** Transitional combined role retained for existing screen call sites. */
  readonly visualRole?: keyof typeof employeeFieldHeights;
  readonly alignment?: "left" | "right" | "center";
}

export function EmployeeField({
  accessibilityLabel,
  inputMode,
  maxLength,
  onChangeText,
  placeholder,
  value,
  kind,
  textAlign,
  prefix,
  size,
  textRole,
  visualRole = "standard",
  alignment,
}: EmployeeFieldProps) {
  const resolvedSize = size ?? visualRole;
  const resolvedTextRole =
    textRole ??
    (visualRole === "plate"
      ? "value"
      : visualRole === "phone"
        ? "phone"
        : "body");
  const fieldStyle = [
    employeeFieldStyles.field,
    { height: employeeFieldHeights[resolvedSize] },
    resolvedTextRole === "value" && employeeTypography.operationalValueStrong,
    resolvedTextRole === "phone" && employeeTypography.phoneField,
    visualRole === "plate" && { borderRadius: employeeRadius.primary },
  ];
  return (
    <View style={{ gap: employeeSpacing.sm }}>
      <Text
        style={[
          employeeFieldStyles.label,
          employeeTextStyle("human", textAlign),
        ]}
      >
        {accessibilityLabel}
      </Text>
      <View
        style={{
          flexDirection: "row",
          direction: "ltr",
          gap: employeeSpacing.sm,
        }}
      >
        {prefix ? (
          <Text
            style={[
              ...fieldStyle,
              employeeTextStyle("identifier", textAlign),
              { textAlignVertical: "center" },
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
          placeholderTextColor={c.muted}
          style={[
            ...fieldStyle,
            { flex: 1 },
            employeeTextStyle(kind, textAlign, alignment),
          ]}
          value={value}
        />
      </View>
    </View>
  );
}
