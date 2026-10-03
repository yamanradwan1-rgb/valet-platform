import { createEmployeeStyles } from "../appearance/employee-themed-styles";

import {
  employeeRadius,
  employeeSpacing as space,
} from "../employee-ui/employee-tokens";
import { employeeTypography as type } from "../employee-ui/employee-typography";

export const nativeTaskQueueRowStylesTheme = createEmployeeStyles((p) => ({
  assignedToOther: { opacity: 0.6 },
  badges: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.sm,
  },
  busy: { ...type.small, color: p.linkPrimary, fontWeight: "600" },
  content: { flex: 1, gap: space.xs, minWidth: 0 },
  detail: { ...type.small, color: p.textSecondary },
  meta: { alignItems: "center", flexDirection: "row", flexWrap: "wrap" },
  row: {
    alignItems: "center",
    backgroundColor: p.surface,
    borderColor: p.border,
    borderRadius: employeeRadius.form,
    borderWidth: 1,
    flexDirection: "row",
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  time: { ...type.small, color: p.textMuted },
  vehicle: {
    ...type.label,
    color: p.textPrimary,
    fontFamily: type.vehicleIdentity.fontFamily,
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 19,
  },
}));
export const nativeTaskQueueRowStyles = nativeTaskQueueRowStylesTheme.light;
