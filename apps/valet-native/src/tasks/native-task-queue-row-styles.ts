import { StyleSheet } from "react-native";

import {
  employeeColors as c,
  employeeRadius,
  employeeSpacing as space,
} from "../employee-ui/employee-tokens";
import { employeeTypography as type } from "../employee-ui/employee-typography";

export const nativeTaskQueueRowStyles = StyleSheet.create({
  assignedToOther: { opacity: 0.65 },
  badges: { alignItems: "center", flexWrap: "wrap", gap: space.sm },
  busy: { ...type.small, color: c.blue, fontWeight: "600" },
  chevron: { color: c.blue, fontSize: 28, lineHeight: 30 },
  content: { flex: 1, gap: space.xs, minWidth: 0 },
  detail: { ...type.small, color: c.neutral },
  meta: { alignItems: "center", flexWrap: "wrap" },
  row: {
    alignItems: "center",
    backgroundColor: c.white,
    borderColor: c.border,
    borderRadius: employeeRadius.form,
    borderWidth: 1,
    flexDirection: "row",
    gap: space.md,
    minHeight: 88,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  time: { ...type.small, color: c.muted },
  vehicle: { ...type.label, color: c.navy, fontWeight: "700" },
});
