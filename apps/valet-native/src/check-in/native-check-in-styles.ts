import { StyleSheet } from "react-native";

import { employeeControlStyles } from "../employee-ui/employee-controls";
import { employeeFieldStyles } from "../employee-ui/employee-fields";
import { employeeFeedbackStyles } from "../employee-ui/employee-feedback";
import {
  employeeButtonHeights,
  employeeColors as c,
  employeeRadius,
  employeeSpacing as space,
  employeeStatusColors,
} from "../employee-ui/employee-tokens";
import { employeeTypography as typography } from "../employee-ui/employee-typography";

export { employeeColors as checkInColors } from "../employee-ui/employee-tokens";

// Feature composition stays here; reusable visual rules belong to employee-ui.
export const checkInStyles = StyleSheet.create({
  badge: { ...employeeFeedbackStyles.badge, ...employeeStatusColors.primary },
  body: { flexGrow: 1, gap: space.lg, padding: space.screen },
  button: {
    ...employeeControlStyles.button,
    ...employeeControlStyles.primary,
    minHeight: employeeButtonHeights.large,
  },
  buttonDisabled: employeeControlStyles.disabled,
  buttonLabel: { ...employeeControlStyles.buttonLabel, color: c.white },
  card: { ...employeeFeedbackStyles.card, gap: space.compact },
  fieldLabel: employeeFieldStyles.label,
  header: {
    alignItems: "center",
    backgroundColor: c.warm,
    borderBottomColor: c.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: space.md,
    minHeight: employeeButtonHeights.large,
    paddingHorizontal: space.lg,
  },
  headerButton: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    minWidth: 44,
  },
  headerButtonLabel: { ...typography.label, color: c.blue },
  headerTitle: { ...typography.header, color: c.navy, flex: 1 },
  hero: {
    alignItems: "center",
    backgroundColor: c.ice,
    borderRadius: employeeRadius.primary,
    gap: space.compact,
    padding: space.hero,
  },
  heroPlate: {
    ...typography.plate,
    color: c.navy,
    letterSpacing: 4,
    textAlign: "center",
  },
  label: { ...typography.small, color: c.neutral },
  modal: { backgroundColor: c.warm, flex: 1 },
  row: { flexDirection: "row", gap: 10 },
  secondaryButton: employeeControlStyles.secondary,
  secondaryLabel: { color: c.navy },
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
