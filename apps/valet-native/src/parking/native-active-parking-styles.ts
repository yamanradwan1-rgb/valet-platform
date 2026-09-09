import { StyleSheet } from "react-native";

import {
  employeeColors as c,
  employeeSpacing as space,
} from "../employee-ui/employee-tokens";
import { employeeTypography as type } from "../employee-ui/employee-typography";

export const nativeActiveParkingStyles = StyleSheet.create({
  body: { gap: space.lg, padding: space.screen, paddingBottom: space.hero },
  detailCard: {
    backgroundColor: c.white,
    borderColor: c.border,
    borderRadius: 16,
    borderWidth: 1,
  },
  elapsedCard: {
    alignItems: "center",
    backgroundColor: c.white,
    borderColor: c.border,
    borderRadius: 16,
    borderWidth: 1,
    gap: 4,
    padding: 20,
  },
  elapsedLabel: {
    ...type.supporting,
    color: c.muted,
    fontWeight: "600",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  elapsedValue: { ...type.plateHero, color: c.navy },
  header: {
    backgroundColor: c.white,
    borderBottomColor: c.border,
    borderBottomWidth: 1,
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  heading: { ...type.pageTitle, color: c.navy },
  row: { gap: 4, padding: 16 },
  rowBorder: { borderTopColor: c.border, borderTopWidth: 1 },
  rowLabel: { ...type.supporting, color: c.muted },
  rowValue: { ...type.body, color: c.navy, fontWeight: "600" },
});
