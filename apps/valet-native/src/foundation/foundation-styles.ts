import { StyleSheet } from "react-native";

import {
  employeeButtonHeights,
  employeeColors as c,
  employeeMinimumTouchTarget,
  employeeRadius,
  employeeSpacing,
} from "../employee-ui/employee-tokens";
import { employeeTypography } from "../employee-ui/employee-typography";

export const styles = StyleSheet.create({
  actionButton: {
    alignItems: "center",
    backgroundColor: c.blue,
    borderRadius: employeeRadius.primary,
    justifyContent: "center",
    minHeight: employeeButtonHeights.large,
    paddingHorizontal: employeeSpacing.lg,
  },
  actionLabel: {
    ...employeeTypography.button,
    color: c.white,
  },
  authPanel: {
    gap: employeeSpacing.lg,
  },
  devDiagnostics: {
    backgroundColor: c.white,
    borderColor: c.border,
    borderRadius: employeeRadius.form,
    borderWidth: 1,
    gap: 2,
    padding: employeeSpacing.md,
  },
  devDiagnosticsButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: c.ice,
    borderRadius: employeeRadius.form,
    justifyContent: "center",
    minHeight: employeeMinimumTouchTarget,
    paddingHorizontal: employeeSpacing.md,
  },
  devDiagnosticsButtonLabel: {
    ...employeeTypography.small,
    color: c.blue,
    fontWeight: "600",
  },
  devDiagnosticsFact: {
    ...employeeTypography.small,
    color: c.neutral,
    fontSize: 11,
    lineHeight: 15,
  },
  devDiagnosticsTitle: {
    ...employeeTypography.small,
    color: c.navy,
    fontWeight: "600",
  },
  disabledButton: {
    opacity: 0.45,
  },
  darkErrorText: {
    color: "#FCA5A5",
  },
  darkInput: {
    backgroundColor: "#FFFFFF14",
    borderColor: "#FFFFFF26",
    color: c.white,
  },
  darkStatus: {
    color: c.white,
  },
  errorText: {
    ...employeeTypography.body,
    color: c.danger,
  },
  input: {
    ...employeeTypography.header,
    backgroundColor: c.white,
    borderColor: c.border,
    borderRadius: employeeRadius.form,
    borderWidth: 1,
    color: c.navy,
    minHeight: employeeButtonHeights.large,
    paddingHorizontal: employeeSpacing.lg,
  },
  localeButton: {
    alignItems: "center",
    backgroundColor: c.ice,
    borderRadius: employeeRadius.form,
    justifyContent: "center",
    minHeight: employeeMinimumTouchTarget,
    minWidth: employeeMinimumTouchTarget,
    paddingHorizontal: employeeSpacing.compact,
  },
  localeLabel: {
    ...employeeTypography.small,
    color: c.neutral,
    fontWeight: "600",
  },
  safeArea: {
    backgroundColor: c.warm,
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
    color: c.navy,
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
    color: c.navy,
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
    color: c.neutral,
  },
  taskStatus: {
    ...employeeTypography.body,
    color: c.neutral,
  },
  taskTitle: {
    ...employeeTypography.header,
    color: c.navy,
    fontWeight: "700",
  },
  tasksPanel: {
    flex: 1,
    gap: employeeSpacing.md,
    minHeight: 0,
  },
});
