import { createEmployeeStyles } from "../appearance/employee-themed-styles";

import { employeeFieldStylesTheme } from "../employee-ui/employee-fields";
import { employeeFeedbackStylesTheme } from "../employee-ui/employee-feedback";
import {
  employeeRadius,
  employeeSpacing as space,
} from "../employee-ui/employee-tokens";
import { employeeTypography as typography } from "../employee-ui/employee-typography";

export { employeeColors as checkInColors } from "../employee-ui/employee-tokens";

// Feature composition stays here; reusable visual rules belong to employee-ui.
export const checkInStylesTheme = createEmployeeStyles((p) => ({
  body: { flexGrow: 1, gap: space.lg, padding: space.screen },
  card: { ...employeeFeedbackStylesTheme[p.mode].card, gap: space.compact },
  eyebrow: {
    ...typography.badge,
    color: p.textSecondary,
    textTransform: "uppercase",
  },
  fieldLabel: employeeFieldStylesTheme[p.mode].label,
  option: {
    alignItems: "center",
    backgroundColor: p.surface,
    borderColor: p.border,
    borderRadius: employeeRadius.form,
    borderWidth: 2,
    flexDirection: "row",
    gap: space.md,
    minHeight: 56,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
  },
  optionCircle: {
    alignItems: "center",
    borderColor: p.border,
    borderRadius: 12,
    borderWidth: 2,
    height: 24,
    justifyContent: "center",
    width: 24,
  },
  optionCircleSelected: {
    backgroundColor: p.actionPrimary,
    borderColor: p.linkPrimary,
  },
  optionDisabled: { opacity: 0.4 },
  optionLabel: { ...typography.body, color: p.textPrimary, fontWeight: "600" },
  optionLabelSelected: { color: p.linkPrimary },
  optionSelected: {
    backgroundColor: p.selectedSurface,
    borderColor: p.linkPrimary,
  },
  options: { gap: space.compact },
  policyNotice: {
    backgroundColor: p.secondaryPressed,
    borderColor: p.border,
    borderRadius: employeeRadius.form,
    borderWidth: 1,
    padding: space.md,
  },
  policyNoticeText: {
    ...typography.supporting,
    color: p.textMuted,
    textAlign: "center",
  },
  recoverableCard: {
    ...employeeFeedbackStylesTheme[p.mode].card,
    elevation: 1,
    gap: space.compact,
    shadowColor: p.shadow,
    shadowOffset: { height: 1, width: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
  },
  text: employeeFeedbackStylesTheme[p.mode].status,
  title: { ...typography.vehicle, color: p.textPrimary },
}));
export const checkInStyles = checkInStylesTheme.light;
