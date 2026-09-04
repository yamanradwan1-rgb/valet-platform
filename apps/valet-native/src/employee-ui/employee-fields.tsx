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
  visualRole = "standard",
  alignment,
}: EmployeeFieldProps) {
  const fieldStyle = [
    employeeFieldStyles.field,
    { minHeight: employeeFieldHeights[visualRole] },
    visualRole === "plate" && {
      ...employeeTypography.plateField,
      borderRadius: employeeRadius.primary,
    },
    visualRole === "phone" && employeeTypography.phoneField,
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
