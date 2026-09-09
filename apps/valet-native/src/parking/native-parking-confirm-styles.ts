import { StyleSheet } from "react-native";

import {
  employeeColors as c,
  employeeSpacing as space,
} from "../employee-ui/employee-tokens";
import { employeeTypography as type } from "../employee-ui/employee-typography";

export const nativeParkingConfirmStyles = StyleSheet.create({
  body: { gap: space.lg, padding: space.screen, paddingBottom: space.hero },
  identifier: {
    ...type.plateField,
    color: c.navy,
    fontWeight: "700",
    writingDirection: "ltr",
  },
  successSurface: {
    alignItems: "center",
    backgroundColor: "#EEFBF5",
    borderColor: "#2F9B7833",
    borderRadius: 16,
    borderWidth: 1,
    gap: 8,
    padding: 20,
  },
  locationHero: { ...type.plateHero, color: c.navy, fontSize: 30 },
  spotInput: {
    ...type.operationalValueStrong,
    backgroundColor: c.white,
    borderColor: c.border,
    borderRadius: 12,
    borderWidth: 1,
    color: c.navy,
    height: 48,
    paddingHorizontal: 16,
    textAlign: "center",
    writingDirection: "ltr",
    width: "100%",
  },
  fieldLabel: {
    ...type.supporting,
    color: c.neutral,
    fontWeight: "600",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  successWrap: { alignItems: "center", gap: 24, minHeight: 500 },
  successCircle: {
    alignItems: "center",
    backgroundColor: c.success,
    borderRadius: 40,
    height: 80,
    justifyContent: "center",
    width: 80,
  },
  successHeading: {
    ...type.pageTitleLarge,
    color: c.navy,
    textAlign: "center",
  },
  successBody: {
    ...type.body,
    color: c.success,
    fontWeight: "600",
    textAlign: "center",
  },
  input: {
    ...type.plateField,
    backgroundColor: c.white,
    borderColor: c.border,
    borderRadius: 12,
    borderWidth: 1,
    color: c.navy,
    minHeight: 52,
    paddingHorizontal: space.md,
    textAlign: "left",
    writingDirection: "ltr",
  },
  title: { ...type.vehicle, color: c.navy, fontWeight: "700" },
});
