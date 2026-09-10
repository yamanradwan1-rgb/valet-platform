import { StyleSheet } from "react-native";

import {
  employeeColors as c,
  employeeRadius,
  employeeSpacing as space,
} from "../employee-ui/employee-tokens";
import { employeeTypography as type } from "../employee-ui/employee-typography";

export const nativeTaskQueueRowStyles = StyleSheet.create({
  assignedToOther: { opacity: 0.6 },
  badges: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.sm,
  },
  busy: { ...type.small, color: c.blue, fontWeight: "600" },
  content: { flex: 1, gap: space.xs, minWidth: 0 },
  detail: { ...type.small, color: c.neutral },
  meta: { alignItems: "center", flexDirection: "row", flexWrap: "wrap" },
  row: {
    alignItems: "center",
    backgroundColor: c.white,
    borderColor: c.border,
    borderRadius: employeeRadius.form,
    borderWidth: 1,
    flexDirection: "row",
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  time: { ...type.small, color: c.muted },
  vehicle: {
    ...type.label,
    color: c.navy,
    fontFamily: type.vehicleIdentity.fontFamily,
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 19,
  },
});
