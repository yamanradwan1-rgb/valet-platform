import { StyleSheet } from "react-native";

import {
  employeeColors as c,
  employeeRadius,
  employeeSpacing as space,
} from "../employee-ui/employee-tokens";
import { employeeTypography as type } from "../employee-ui/employee-typography";

export const nativeTaskCardStyles = StyleSheet.create({
  accent: { backgroundColor: c.blue, height: 4 },
  age: { ...type.header, color: c.danger, fontWeight: "700" },
  ageLabel: { ...type.badge, color: c.neutral, textTransform: "uppercase" },
  ageWrap: { alignItems: "flex-end" },
  card: {
    backgroundColor: c.white,
    borderColor: c.border,
    borderRadius: employeeRadius.primary,
    borderWidth: 1,
    overflow: "hidden",
  },
  content: { gap: space.sm, padding: space.lg },
  detail: { ...type.small, color: c.neutral },
  header: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  plate: { ...type.label, color: c.navy },
  priorityLabel: {
    ...type.badge,
    color: c.blue,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  statusRow: {
    alignItems: "center",
    borderTopColor: c.border,
    borderTopWidth: 1,
    flexDirection: "row",
    gap: space.sm,
    justifyContent: "space-between",
    paddingTop: space.sm,
  },
  vehicle: { ...type.header, color: c.navy, fontSize: 17, fontWeight: "700" },
});
