import { createEmployeeStyles } from "../appearance/employee-themed-styles";

import { employeeSpacing as space } from "../employee-ui/employee-tokens";
import { employeeTypography as type } from "../employee-ui/employee-typography";

export const nativeActiveParkingStylesTheme = createEmployeeStyles((p) => ({
  body: { gap: space.lg, padding: space.screen, paddingBottom: space.hero },
  detailCard: {
    backgroundColor: p.surface,
    borderColor: p.border,
    borderRadius: 16,
    borderWidth: 1,
  },
  elapsedCard: {
    alignItems: "center",
    backgroundColor: p.surface,
    borderColor: p.border,
    borderRadius: 16,
    borderWidth: 1,
    gap: 4,
    padding: 20,
  },
  elapsedLabel: {
    ...type.supporting,
    color: p.textMuted,
    fontWeight: "600",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  elapsedValue: { ...type.plateHero, color: p.textPrimary },
  header: {
    backgroundColor: p.surface,
    borderBottomColor: p.border,
    borderBottomWidth: 1,
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  heading: { ...type.pageTitle, color: p.textPrimary },
  row: { gap: 4, padding: 16 },
  rowBorder: { borderTopColor: p.border, borderTopWidth: 1 },
  rowLabel: { ...type.supporting, color: p.textMuted },
  rowValue: { ...type.body, color: p.textPrimary, fontWeight: "600" },
}));
export const nativeActiveParkingStyles = nativeActiveParkingStylesTheme.light;
