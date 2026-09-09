import { StyleSheet } from "react-native";

import {
  employeeColors as c,
  employeeRadius,
} from "../employee-ui/employee-tokens";
import { employeeTypography as type } from "../employee-ui/employee-typography";

export const nativeTaskCardStyles = StyleSheet.create({
  accent: { backgroundColor: c.blue, height: 4 },
  age: { ...type.operationalValueStrong, color: c.danger },
  ageLabel: { ...type.badge, color: c.neutral, textTransform: "uppercase" },
  ageWrap: { alignItems: "flex-end" },
  card: {
    backgroundColor: c.white,
    borderColor: c.border,
    borderRadius: employeeRadius.primary,
    borderWidth: 1,
    overflow: "hidden",
  },
  assignedToOther: { opacity: 0.75 },
  content: { padding: 20 },
  detail: { ...type.supportingLarge, color: c.neutral, marginTop: 6 },
  header: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  vehicleMeta: { ...type.body, color: c.neutral },
  vehicleMetaRow: { flexDirection: "row" },
  statusRow: {
    alignItems: "center",
    borderTopColor: c.border,
    borderTopWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 16,
    paddingTop: 16,
  },
  statusLabel: {
    ...type.badge,
    color: c.neutral,
    fontWeight: "400",
    textTransform: "uppercase",
  },
  statusText: { ...type.body, color: c.navy, fontWeight: "600", marginTop: 2 },
  vehicle: { ...type.vehicleIdentity, color: c.navy },
});
