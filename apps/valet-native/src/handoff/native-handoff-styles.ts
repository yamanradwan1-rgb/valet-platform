import { StyleSheet } from "react-native";

import {
  employeeColors as c,
  employeeSpacing as space,
} from "../employee-ui/employee-tokens";
import { employeeTypography as type } from "../employee-ui/employee-typography";

export const nativeHandoffStyles = StyleSheet.create({
  body: { gap: space.lg, padding: space.screen },
  camera: { height: 220 },
  input: {
    ...type.body,
    backgroundColor: c.white,
    borderColor: c.border,
    borderRadius: 12,
    borderWidth: 1,
    color: c.navy,
    minHeight: 52,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  ltr: { textAlign: "left", writingDirection: "ltr" },
  reason: { minHeight: 88, textAlignVertical: "top" },
  section: { gap: space.sm },
  vehicle: { ...type.vehicle, color: c.navy },
});
