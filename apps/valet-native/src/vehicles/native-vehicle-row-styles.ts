import { createEmployeeStyles } from "../appearance/employee-themed-styles";

import { employeeRadius } from "../employee-ui/employee-tokens";
import { employeeTypography as type } from "../employee-ui/employee-typography";

export const nativeVehicleRowStylesTheme = createEmployeeStyles((p) => ({
  card: {
    backgroundColor: p.surface,
    borderColor: p.border,
    borderRadius: employeeRadius.form,
    borderWidth: 1,
    overflow: "hidden",
  },
  collapsed: { padding: 16 },
  expanded: {
    backgroundColor: p.appBackground,
    borderTopColor: p.border,
    borderTopWidth: 1,
    paddingBottom: 16,
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  header: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between",
    marginBottom: 8,
  },
  title: {
    ...type.label,
    color: p.textPrimary,
    flex: 1,
    fontFamily: type.vehicleIdentity.fontFamily,
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 19,
  },
  vehicleMeta: { ...type.supporting, color: p.textSecondary },
  vehicleMetaRow: { flexDirection: "row", marginBottom: 12 },
  summary: {
    borderTopColor: p.border,
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 20,
    paddingTop: 12,
  },
  summaryCell: { flex: 1, minWidth: 0 },
  summaryLabel: {
    ...type.badge,
    color: p.textMuted,
    fontWeight: "400",
    textTransform: "uppercase",
  },
  summaryValue: {
    ...type.body,
    color: p.textPrimary,
    fontWeight: "600",
    marginTop: 2,
  },
  missing: { color: p.textMuted, fontWeight: "400" },
  detailRow: {
    alignItems: "center",
    borderBottomColor: p.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    paddingVertical: 12,
  },
  detailRowLast: { borderBottomWidth: 0 },
  detailLabel: { ...type.supporting, color: p.textSecondary },
  detailValue: { ...type.body, color: p.textPrimary, fontWeight: "600" },
  readOnly: {
    ...type.supporting,
    color: p.textMuted,
    fontSize: 11,
    paddingTop: 8,
  },
}));
export const nativeVehicleRowStyles = nativeVehicleRowStylesTheme.light;
