import { createEmployeeStyles } from "../appearance/employee-themed-styles";

import { employeeSpacing as space } from "../employee-ui/employee-tokens";
import { employeeTypography as type } from "../employee-ui/employee-typography";

export const nativeHandoffStylesTheme = createEmployeeStyles((p) => ({
  body: { gap: space.lg, padding: space.screen, paddingBottom: space.hero },
  camera: { height: 220 },
  eyebrow: {
    ...type.badge,
    color: p.textMuted,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  input: {
    ...type.body,
    backgroundColor: p.appBackground,
    borderColor: p.border,
    borderRadius: 12,
    borderWidth: 1,
    color: p.textPrimary,
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
  fieldLabel: { ...type.body, color: p.textPrimary, fontWeight: "700" },
  ltr: { textAlign: "left", writingDirection: "ltr" },
  reason: { height: 80, textAlignVertical: "top" },
  abortReason: { height: 64, textAlignVertical: "top" },
  section: { gap: space.sm },
  card: {
    backgroundColor: p.surface,
    borderColor: p.border,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
    padding: 16,
  },
  cardBody: { ...type.supporting, color: p.textSecondary, lineHeight: 19 },
  warning: {
    ...type.supporting,
    backgroundColor: p.handoffWarningSurface,
    borderColor: p.handoffWarningBorder,
    borderRadius: 12,
    borderWidth: 1,
    color: p.handoffWarningText,
    fontWeight: "600",
    padding: 12,
  },
  vehicle: {
    ...type.body,
    color: p.textPrimary,
    fontFamily: "Space Grotesk",
    fontSize: 18,
    fontWeight: "700",
  },
}));
export const nativeHandoffStyles = nativeHandoffStylesTheme.light;
