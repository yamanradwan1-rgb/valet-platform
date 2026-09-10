import { StyleSheet } from "react-native";

import {
  employeeColors as c,
  employeeSpacing as space,
} from "../employee-ui/employee-tokens";
import { employeeTypography as type } from "../employee-ui/employee-typography";

export const nativeHandoffStyles = StyleSheet.create({
  body: { gap: space.lg, padding: space.screen, paddingBottom: space.hero },
  camera: { height: 220 },
  eyebrow: {
    ...type.badge,
    color: c.muted,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  input: {
    ...type.body,
    backgroundColor: c.warm,
    borderColor: c.border,
    borderRadius: 12,
    borderWidth: 1,
    color: c.navy,
    height: 48,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  pickupInput: {
    fontSize: 18,
    letterSpacing: 5,
    textAlign: "left",
    writingDirection: "ltr",
  },
  fieldLabel: { ...type.body, color: c.navy, fontWeight: "700" },
  ltr: { textAlign: "left", writingDirection: "ltr" },
  reason: { height: 80, textAlignVertical: "top" },
  abortReason: { height: 64, textAlignVertical: "top" },
  section: { gap: space.sm },
  card: {
    backgroundColor: c.white,
    borderColor: c.border,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
    padding: 16,
  },
  cardBody: { ...type.supporting, color: c.neutral, lineHeight: 19 },
  warning: {
    ...type.supporting,
    backgroundColor: "#FFFBEB",
    borderColor: "#FCD34D",
    borderRadius: 12,
    borderWidth: 1,
    color: "#92400E",
    fontWeight: "600",
    padding: 12,
  },
  vehicle: {
    ...type.body,
    color: c.navy,
    fontFamily: "Space Grotesk",
    fontSize: 18,
    fontWeight: "700",
  },
});
