import type { ReactNode } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import {
  employeeCardPadding,
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
  },
  badge: {
    alignItems: "center",
    alignSelf: "flex-start",
    borderRadius: employeeRadius.pill,
    flexDirection: "row",
    gap: employeeSpacing.compact,
    paddingHorizontal: 10,
    paddingVertical: employeeSpacing.xs,
  },
  badgeDot: {
    borderRadius: employeeRadius.pill,
    height: 6,
    width: 6,
  },
  badgeLabel: employeeTypography.badge,
  error: {
    ...employeeTypography.small,
    backgroundColor: employeeFeedbackColors.errorSurface,
    borderColor: employeeFeedbackColors.errorBorder,
    borderRadius: employeeRadius.form,
    borderWidth: 1,
    color: c.danger,
    padding: employeeSpacing.md,
  },
  errorBody: { ...employeeTypography.small, color: c.danger },
  errorNotice: {
    backgroundColor: employeeFeedbackColors.errorSurface,
    borderColor: employeeFeedbackColors.errorBorder,
    borderRadius: employeeRadius.form,
    borderWidth: 1,
    gap: employeeSpacing.xs,
    padding: employeeSpacing.md,
  },
  errorTitle: {
    ...employeeTypography.body,
    color: c.danger,
    fontWeight: "700",
  },
  successCard: {
    backgroundColor: "#EEFBF5",
    borderColor: "#2F9B7833",
  },
  progress: {
    alignItems: "center",
    flex: 1,
    gap: employeeSpacing.lg,
    justifyContent: "center",
    minHeight: 320,
  },
  status: { ...employeeTypography.body, color: c.neutral },
});

export function EmployeeCard({
  accessibilityLabel,
  children,
  contentGap = "compact",
  padding = "compact",
  variant = "default",
}: {
  readonly accessibilityLabel?: string;
  readonly children: ReactNode;
  readonly contentGap?: keyof typeof employeeSpacing | "none";
  readonly padding?: keyof typeof employeeCardPadding;
  readonly variant?: "default" | "success";
}) {
  return (
    <View
      accessible={accessibilityLabel !== undefined}
      accessibilityLabel={accessibilityLabel}
      style={[
        employeeFeedbackStyles.card,
        variant === "success" && employeeFeedbackStyles.successCard,
        {
          gap: contentGap === "none" ? 0 : employeeSpacing[contentGap],
          padding: employeeCardPadding[padding],
        },
      ]}
    >
      {children}
    </View>
  );
}

// Compact status labels only. Explanatory copy belongs in EmployeeStatus.
export function EmployeeBadge({
  label,
  showDot = false,
  variant = "primary",
  textAlign,
}: {
  readonly label: string;
  readonly showDot?: boolean;
  readonly variant?: keyof typeof employeeStatusColors;
  readonly textAlign: EmployeeTextAlign;
}) {
  return (
    <View
      accessible
      accessibilityLabel={label}
      style={[
        employeeFeedbackStyles.badge,
        {
          backgroundColor: employeeStatusColors[variant].backgroundColor,
          flexDirection: textAlign === "right" ? "row-reverse" : "row",
        },
      ]}
    >
      {showDot ? (
        <View
          accessible={false}
          style={[
            employeeFeedbackStyles.badgeDot,
            { backgroundColor: employeeStatusColors[variant].dotColor },
          ]}
        />
      ) : null}
      <Text
        accessible={false}
        style={[
          employeeFeedbackStyles.badgeLabel,
          { color: employeeStatusColors[variant].color },
          employeeTextStyle("human", textAlign),
        ]}
      >
        {label}
      </Text>
    </View>
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

export function EmployeeErrorNotice({
  children,
  textAlign,
  title,
}: Omit<FeedbackProps, "children"> & {
  readonly children: string;
  readonly title: string;
}) {
  return (
    <View
      accessible
      accessibilityLabel={`${title}. ${children}`}
      accessibilityLiveRegion="assertive"
      accessibilityRole="alert"
      style={employeeFeedbackStyles.errorNotice}
    >
      <Text
        style={[
          employeeFeedbackStyles.errorTitle,
          employeeTextStyle("human", textAlign),
        ]}
      >
        {title}
      </Text>
      <Text
        style={[
          employeeFeedbackStyles.errorBody,
          employeeTextStyle("human", textAlign),
        ]}
      >
        {children}
      </Text>
    </View>
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
      style={employeeFeedbackStyles.progress}
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
