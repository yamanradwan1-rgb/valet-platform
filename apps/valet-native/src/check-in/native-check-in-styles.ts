import { StyleSheet } from "react-native";

import { employeeFieldStyles } from "../employee-ui/employee-fields";
import { employeeFeedbackStyles } from "../employee-ui/employee-feedback";
import {
  employeeColors as c,
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
