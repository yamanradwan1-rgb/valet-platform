import { createEmployeeStyles } from "../appearance/employee-themed-styles";
import {
  useEmployeeStyles,
  useEmployeePalette,
} from "../appearance/employee-appearance-context";
import { employeeStatusPalette } from "../appearance/employee-palette";
import type { ReactNode } from "react";
import { ActivityIndicator, Text, View } from "react-native";

import {
  employeeCardPadding,
  employeeRadius,
  employeeSpacing,
} from "./employee-tokens";
import {
  employeeTextStyle,
  employeeTypography,
  type EmployeeTextAlign,
} from "./employee-typography";

export const employeeFeedbackStylesTheme = createEmployeeStyles((p) => ({
  card: {
    backgroundColor: p.surface,
    borderColor: p.border,
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
    backgroundColor: p.errorSurface,
    borderColor: p.errorBorder,
    borderRadius: employeeRadius.form,
    borderWidth: 1,
    color: p.danger,
    padding: employeeSpacing.md,
  },
  errorBody: { ...employeeTypography.small, color: p.danger },
  errorNotice: {
    backgroundColor: p.errorSurface,
    borderColor: p.errorBorder,
    borderRadius: employeeRadius.form,
    borderWidth: 1,
    gap: employeeSpacing.xs,
    padding: employeeSpacing.md,
  },
  errorTitle: {
    ...employeeTypography.body,
    color: p.danger,
    fontWeight: "700",
  },
  successCard: {
    backgroundColor: p.successSurface,
    borderColor: p.successBorder,
  },
  progress: {
    alignItems: "center",
    flex: 1,
    gap: employeeSpacing.lg,
    justifyContent: "center",
    minHeight: 320,
  },
  status: { ...employeeTypography.body, color: p.textSecondary },
}));
export const employeeFeedbackStyles = employeeFeedbackStylesTheme.light;

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
  const employeeFeedbackStyles = useEmployeeStyles(employeeFeedbackStylesTheme);

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
  readonly variant?: keyof ReturnType<typeof employeeStatusPalette>;
  readonly textAlign: EmployeeTextAlign;
}) {
  const p = useEmployeePalette();
  const employeeFeedbackStyles = useEmployeeStyles(employeeFeedbackStylesTheme);

  return (
    <View
      accessible
      accessibilityLabel={label}
      style={[
        employeeFeedbackStyles.badge,
        {
          backgroundColor: employeeStatusPalette(p)[variant].backgroundColor,
        },
      ]}
    >
      {showDot ? (
        <View
          accessible={false}
          style={[
            employeeFeedbackStyles.badgeDot,
            { backgroundColor: employeeStatusPalette(p)[variant].dotColor },
          ]}
        />
      ) : null}
      <Text
        accessible={false}
        style={[
          employeeFeedbackStyles.badgeLabel,
          { color: employeeStatusPalette(p)[variant].color },
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
  const employeeFeedbackStyles = useEmployeeStyles(employeeFeedbackStylesTheme);

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
  const employeeFeedbackStyles = useEmployeeStyles(employeeFeedbackStylesTheme);

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
  const employeeFeedbackStyles = useEmployeeStyles(employeeFeedbackStylesTheme);

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
  const p = useEmployeePalette();
  const employeeFeedbackStyles = useEmployeeStyles(employeeFeedbackStylesTheme);

  return (
    <View
      accessible
      accessibilityLabel={label}
      accessibilityRole="progressbar"
      accessibilityLiveRegion="polite"
      accessibilityState={{ busy: true }}
      style={employeeFeedbackStyles.progress}
    >
      <ActivityIndicator
        accessible={false}
        color={p.linkPrimary}
        size="large"
      />
      <Text
        style={[
          employeeTypography.label,
          { color: p.textPrimary },
          employeeTextStyle("human", textAlign),
        ]}
      >
        {label}
      </Text>
    </View>
  );
}
