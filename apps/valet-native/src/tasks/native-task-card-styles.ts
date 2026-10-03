import { createEmployeeStyles } from "../appearance/employee-themed-styles";

import { employeeRadius } from "../employee-ui/employee-tokens";
import { employeeTypography as type } from "../employee-ui/employee-typography";

export const nativeTaskCardStylesTheme = createEmployeeStyles((p) => ({
  accent: { backgroundColor: p.actionPrimary, height: 4 },
  age: { ...type.operationalValueStrong, color: p.danger },
  ageLabel: {
    ...type.badge,
    color: p.textSecondary,
    textTransform: "uppercase",
  },
  ageWrap: { alignItems: "flex-end" },
  card: {
    backgroundColor: p.surface,
    borderColor: p.border,
    borderRadius: employeeRadius.primary,
    borderWidth: 1,
    elevation: 1,
    overflow: "hidden",
    shadowColor: p.shadow,
    shadowOffset: { height: 1, width: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
  },
  assignedToOther: { opacity: 0.75 },
  content: { padding: 20 },
  detail: { ...type.supportingLarge, color: p.textSecondary, marginTop: 6 },
  header: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  vehicleMeta: { ...type.body, color: p.textSecondary },
  vehicleMetaRow: { flexDirection: "row" },
  statusRow: {
    alignItems: "center",
    borderTopColor: p.border,
    borderTopWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 16,
    paddingTop: 16,
  },
  statusLabel: {
    ...type.badge,
    color: p.textSecondary,
    fontWeight: "400",
    textTransform: "uppercase",
  },
  statusText: {
    ...type.body,
    color: p.textPrimary,
    fontWeight: "600",
    marginTop: 2,
  },
  vehicle: { ...type.vehicleIdentity, color: p.textPrimary },
}));
export const nativeTaskCardStyles = nativeTaskCardStylesTheme.light;
