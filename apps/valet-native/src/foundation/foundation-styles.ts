import { createEmployeeStyles } from "../appearance/employee-themed-styles";

import {
  employeeButtonHeights,
  employeeMinimumTouchTarget,
  employeeRadius,
  employeeSpacing,
} from "../employee-ui/employee-tokens";
import { employeeTypography } from "../employee-ui/employee-typography";

export const stylesTheme = createEmployeeStyles((p) => ({
  actionButton: {
    alignItems: "center",
    backgroundColor: p.actionPrimary,
    borderRadius: employeeRadius.primary,
    justifyContent: "center",
    minHeight: employeeButtonHeights.large,
    paddingHorizontal: employeeSpacing.lg,
  },
  actionLabel: {
    ...employeeTypography.button,
    color: p.onAction,
  },
  authPanel: {
    gap: employeeSpacing.lg,
  },
  devDiagnostics: {
    backgroundColor: p.surface,
    borderColor: p.border,
    borderRadius: employeeRadius.form,
    borderWidth: 1,
    gap: 2,
    padding: employeeSpacing.md,
  },
  devDiagnosticsButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: p.selectedSurface,
    borderRadius: employeeRadius.form,
    justifyContent: "center",
    minHeight: employeeMinimumTouchTarget,
    paddingHorizontal: employeeSpacing.md,
  },
  devDiagnosticsButtonLabel: {
    ...employeeTypography.small,
    color: p.linkPrimary,
    fontWeight: "600",
  },
  devDiagnosticsFact: {
    ...employeeTypography.small,
    color: p.textSecondary,
    fontSize: 11,
    lineHeight: 15,
  },
  devDiagnosticsTitle: {
    ...employeeTypography.small,
    color: p.textPrimary,
    fontWeight: "600",
  },
  disabledButton: {
    opacity: 0.45,
  },
  darkErrorText: {
    color: p.gateErrorText,
  },
  darkInput: {
    backgroundColor: p.gateInputSurface,
    borderColor: p.gateInputBorder,
    color: p.onAction,
  },
  darkStatus: {
    color: p.onAction,
  },
  errorText: {
    ...employeeTypography.body,
    color: p.danger,
  },
  input: {
    ...employeeTypography.header,
    backgroundColor: p.surface,
    borderColor: p.border,
    borderRadius: employeeRadius.form,
    borderWidth: 1,
    color: p.textPrimary,
    minHeight: employeeButtonHeights.large,
    paddingHorizontal: employeeSpacing.lg,
  },
  localeButton: {
    alignItems: "center",
    backgroundColor: p.selectedSurface,
    borderRadius: employeeRadius.form,
    justifyContent: "center",
    minHeight: employeeMinimumTouchTarget,
    minWidth: employeeMinimumTouchTarget,
    paddingHorizontal: employeeSpacing.compact,
  },
  localeLabel: {
    ...employeeTypography.small,
    color: p.textSecondary,
    fontWeight: "600",
  },
  safeArea: {
    backgroundColor: p.appBackground,
    flex: 1,
  },
  screen: {
    flex: 1,
    gap: employeeSpacing.lg,
    paddingHorizontal: employeeSpacing.screen,
    paddingVertical: employeeSpacing.lg,
  },
  status: {
    ...employeeTypography.header,
    color: p.textPrimary,
    fontSize: 20,
    fontWeight: "600",
    lineHeight: 28,
  },
  taskHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: employeeSpacing.sm,
    justifyContent: "space-between",
  },
  taskHeaderActions: {
    alignItems: "center",
    flexDirection: "row",
    gap: employeeSpacing.xs,
  },
  taskHeading: {
    ...employeeTypography.header,
    color: p.textPrimary,
    fontSize: 24,
    fontWeight: "700",
    lineHeight: 32,
  },
  taskList: {
    gap: employeeSpacing.sm,
    paddingBottom: employeeSpacing.sm,
  },
  taskMeta: {
    ...employeeTypography.small,
    color: p.textSecondary,
  },
  taskStatus: {
    ...employeeTypography.body,
    color: p.textSecondary,
  },
  taskTitle: {
    ...employeeTypography.header,
    color: p.textPrimary,
    fontWeight: "700",
  },
  tasksPanel: {
    flex: 1,
    gap: employeeSpacing.md,
    minHeight: 0,
  },
}));
export const styles = stylesTheme.light;
