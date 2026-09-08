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
