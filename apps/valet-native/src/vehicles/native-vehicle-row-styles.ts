import { StyleSheet } from "react-native";

import {
  employeeColors as c,
  employeeRadius,
} from "../employee-ui/employee-tokens";
import { employeeTypography as type } from "../employee-ui/employee-typography";

export const nativeVehicleRowStyles = StyleSheet.create({
  card: {
    backgroundColor: c.white,
    borderColor: c.border,
    borderRadius: employeeRadius.form,
    borderWidth: 1,
    overflow: "hidden",
  },
  collapsed: { padding: 16 },
  expanded: {
    backgroundColor: c.warm,
    borderTopColor: c.border,
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
    color: c.navy,
    flex: 1,
    fontFamily: type.vehicleIdentity.fontFamily,
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 19,
  },
  vehicleMeta: { ...type.supporting, color: c.neutral },
  vehicleMetaRow: { flexDirection: "row", marginBottom: 12 },
  summary: {
    borderTopColor: c.border,
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 20,
    paddingTop: 12,
  },
  summaryCell: { flex: 1, minWidth: 0 },
  summaryLabel: {
    ...type.badge,
    color: c.muted,
    fontWeight: "400",
    textTransform: "uppercase",
  },
  summaryValue: {
    ...type.body,
    color: c.navy,
    fontWeight: "600",
    marginTop: 2,
  },
  missing: { color: c.muted, fontWeight: "400" },
  detailRow: {
    alignItems: "center",
    borderBottomColor: c.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    paddingVertical: 12,
  },
  detailLabel: { ...type.supporting, color: c.neutral },
  detailValue: { ...type.body, color: c.navy, fontWeight: "600" },
  readOnly: { ...type.supporting, color: c.muted, fontSize: 11, paddingTop: 8 },
});
