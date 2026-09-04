import type { ReactNode } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import {
  employeeColors as c,
  employeeFeedbackColors,
  employeeRadius,
  employeeSpacing,
  employeeStatusColors,
} from "./employee-tokens";
import {
  employeeTextStyle,
  employeeTypography,
  type EmployeeTextAlign,
} from "./employee-typography";

export const employeeFeedbackStyles = StyleSheet.create({
  card: {
    backgroundColor: c.white,
    borderColor: c.border,
    borderRadius: employeeRadius.primary,
    borderWidth: 1,
    padding: employeeSpacing.lg,
  },
  badge: {
    ...employeeTypography.badge,
    alignSelf: "flex-start",
    borderRadius: employeeRadius.pill,
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: employeeSpacing.xs,
  },
  error: {
    ...employeeTypography.small,
    backgroundColor: employeeFeedbackColors.errorSurface,
    borderColor: employeeFeedbackColors.errorBorder,
    borderRadius: employeeRadius.form,
    borderWidth: 1,
    color: c.danger,
    padding: employeeSpacing.md,
  },
  status: { ...employeeTypography.body, color: c.neutral },
});

export function EmployeeCard({
  accessibilityLabel,
  children,
}: {
  readonly accessibilityLabel?: string;
  readonly children: ReactNode;
}) {
  return (
    <View
      accessible={accessibilityLabel !== undefined}
      accessibilityLabel={accessibilityLabel}
      style={[employeeFeedbackStyles.card, { gap: employeeSpacing.compact }]}
    >
      {children}
    </View>
  );
}

// Compact status labels only. Explanatory copy belongs in EmployeeStatus.
export function EmployeeBadge({
  label,
  variant = "primary",
  textAlign,
}: {
  readonly label: string;
  readonly variant?: keyof typeof employeeStatusColors;
  readonly textAlign: EmployeeTextAlign;
}) {
  return (
    <Text
      style={[
        employeeFeedbackStyles.badge,
        employeeStatusColors[variant],
        employeeTextStyle("human", textAlign),
      ]}
    >
      {label}
    </Text>
  );
}

interface FeedbackProps {
  readonly children: ReactNode;
  readonly textAlign: EmployeeTextAlign;
}

export function EmployeeError({ children, textAlign }: FeedbackProps) {
  return (
    <Text
      accessibilityLiveRegion="assertive"
      style={[
        employeeFeedbackStyles.error,
        employeeTextStyle("human", textAlign),
      ]}
    >
      {children}
    </Text>
  );
}

export function EmployeeStatus({ children, textAlign }: FeedbackProps) {
  return (
    <Text
      accessibilityLiveRegion="polite"
      style={[
        employeeFeedbackStyles.status,
        employeeTextStyle("human", textAlign),
      ]}
    >
      {children}
    </Text>
  );
}

// Native progress indicator, not a CSS spinner or a new workflow state.
export function EmployeeProgress({
  label,
  textAlign,
}: {
  readonly label: string;
  readonly textAlign: EmployeeTextAlign;
}) {
  return (
    <View
      accessible
      accessibilityLabel={label}
      accessibilityRole="progressbar"
      accessibilityLiveRegion="polite"
      accessibilityState={{ busy: true }}
      style={{ alignItems: "center", gap: employeeSpacing.lg }}
    >
      <ActivityIndicator accessible={false} color={c.blue} size="large" />
      <Text
        style={[
          employeeTypography.label,
          { color: c.navy },
          employeeTextStyle("human", textAlign),
        ]}
      >
        {label}
      </Text>
    </View>
  );
}
