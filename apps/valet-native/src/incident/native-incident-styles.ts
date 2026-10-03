import { createEmployeeStyles } from "../appearance/employee-themed-styles";

import {
  employeeRadius,
  employeeSpacing as space,
} from "../employee-ui/employee-tokens";
import {
  employeeFontFamilies,
  employeeTypography as type,
} from "../employee-ui/employee-typography";

export const nativeIncidentStylesTheme = createEmployeeStyles((p) => ({
  body: { gap: space.lg, padding: space.screen },
  choice: {
    alignItems: "flex-start",
    backgroundColor: p.surface,
    borderColor: p.border,
    borderRadius: employeeRadius.form,
    borderWidth: 2,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: space.md,
    paddingVertical: 10,
  },
  choiceLabel: { ...type.small, color: p.textPrimary, fontWeight: "600" },
  choiceSelected: {
    backgroundColor: p.dangerSurface,
    borderColor: p.danger,
  },
  choiceSelectedLabel: { color: p.danger },
  contextCard: {
    backgroundColor: p.surface,
    borderColor: p.border,
    borderRadius: employeeRadius.form,
    borderWidth: 1,
    gap: space.xs,
    padding: space.lg,
  },
  contextSession: { ...type.small, color: p.textSecondary },
  contextVehicle: {
    ...type.body,
    color: p.textPrimary,
    fontFamily: employeeFontFamilies.display,
    fontWeight: "700",
  },
  description: {
    ...type.body,
    backgroundColor: p.surface,
    borderColor: p.border,
    borderRadius: employeeRadius.form,
    borderWidth: 1,
    color: p.textPrimary,
    minHeight: 108,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    textAlignVertical: "top",
  },
  error: {
    ...type.small,
    backgroundColor: p.errorSurface,
    borderColor: p.errorBorder,
    borderRadius: employeeRadius.form,
    borderWidth: 1,
    color: p.danger,
    padding: space.md,
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  label: { ...type.label, color: p.textPrimary },
  loading: {
    alignItems: "center",
    gap: space.lg,
    justifyContent: "center",
    minHeight: 400,
    padding: space.hero,
  },
  optionHalf: { flexBasis: "48%", flexGrow: 1 },
  optionQuarter: { flexBasis: "22%", flexGrow: 1, paddingHorizontal: space.sm },
  resultBody: {
    alignItems: "center",
    gap: space.hero,
    minHeight: 500,
    padding: space.hero,
  },
  resultCard: { alignSelf: "stretch" },
  resultIcon: {
    alignItems: "center",
    backgroundColor: p.dangerSurface,
    borderRadius: 40,
    height: 80,
    justifyContent: "center",
    width: 80,
  },
  resultReference: {
    ...type.body,
    color: p.textSecondary,
    marginTop: space.xs,
  },
  resultSummary: {
    alignSelf: "stretch",
    backgroundColor: p.surface,
    borderColor: p.border,
    borderRadius: employeeRadius.primary,
    borderWidth: 1,
    overflow: "hidden",
  },
  resultTitle: {
    ...type.pageTitleLarge,
    color: p.textPrimary,
    textAlign: "center",
  },
  severityLabel: { textAlign: "center" },
}));
export const nativeIncidentStyles = nativeIncidentStylesTheme.light;
