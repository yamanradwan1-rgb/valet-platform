import { StyleSheet } from "react-native";

import { employeeFieldStyles } from "../employee-ui/employee-fields";
import { employeeFeedbackStyles } from "../employee-ui/employee-feedback";
import {
  employeeColors as c,
  employeeRadius,
  employeeSpacing as space,
} from "../employee-ui/employee-tokens";
import { employeeTypography as typography } from "../employee-ui/employee-typography";

export { employeeColors as checkInColors } from "../employee-ui/employee-tokens";

// Feature composition stays here; reusable visual rules belong to employee-ui.
export const checkInStyles = StyleSheet.create({
  body: { flexGrow: 1, gap: space.lg, padding: space.screen },
  card: { ...employeeFeedbackStyles.card, gap: space.compact },
  eyebrow: {
    ...typography.badge,
    color: c.neutral,
    textTransform: "uppercase",
  },
  fieldLabel: employeeFieldStyles.label,
  option: {
    alignItems: "center",
    backgroundColor: c.white,
    borderColor: c.border,
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
    borderColor: c.border,
    borderRadius: 12,
    borderWidth: 2,
    height: 24,
    justifyContent: "center",
    width: 24,
  },
  optionCircleSelected: { backgroundColor: c.blue, borderColor: c.blue },
  optionDisabled: { opacity: 0.4 },
  optionLabel: { ...typography.body, color: c.navy, fontWeight: "600" },
  optionLabelSelected: { color: c.blue },
  optionSelected: { backgroundColor: c.ice, borderColor: c.blue },
  options: { gap: space.compact },
  policyNotice: {
    backgroundColor: "#F9FAFB",
    borderColor: c.border,
    borderRadius: employeeRadius.form,
    borderWidth: 1,
    padding: space.md,
  },
  policyNoticeText: {
    ...typography.supporting,
    color: c.muted,
    textAlign: "center",
  },
  recoverableCard: {
    ...employeeFeedbackStyles.card,
    elevation: 1,
    gap: space.compact,
    shadowColor: c.navy,
    shadowOffset: { height: 1, width: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
  },
  text: employeeFeedbackStyles.status,
  title: { ...typography.vehicle, color: c.navy },
});
