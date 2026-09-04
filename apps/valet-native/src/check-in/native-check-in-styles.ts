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
  fieldLabel: employeeFieldStyles.label,
  successCircle: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: c.success,
    borderRadius: 40,
    height: 80,
    justifyContent: "center",
    width: 80,
  },
  successMark: { color: c.white, fontSize: 38, fontWeight: "700" },
  text: employeeFeedbackStyles.status,
  title: { ...typography.vehicle, color: c.navy },
});
