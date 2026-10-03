import { createEmployeeStyles } from "../appearance/employee-themed-styles";

import {
  employeeRadius,
  employeeSpacing as space,
} from "../employee-ui/employee-tokens";
import {
  employeeFontFamilies,
  employeeTypography as type,
} from "../employee-ui/employee-typography";

export const nativeGuestAccessStylesTheme = createEmployeeStyles((p) => ({
  body: { gap: space.screen, padding: space.screen },
  card: {
    backgroundColor: p.surface,
    borderColor: p.border,
    borderRadius: employeeRadius.primary,
    borderWidth: 1,
    gap: space.lg,
    padding: space.screen,
  },
  cardCompact: { gap: space.md },
  cardTitle: {
    ...type.pageTitle,
    color: p.textPrimary,
    fontFamily: employeeFontFamilies.display,
    fontSize: 18,
    fontWeight: "700",
  },
  center: { alignItems: "center" },
  configError: {
    ...type.small,
    backgroundColor: p.errorSurface,
    borderColor: p.errorBorder,
    borderRadius: employeeRadius.form,
    borderWidth: 1,
    color: p.danger,
    padding: space.md,
  },
  date: { ...type.body, color: p.textPrimary, fontWeight: "600" },
  dividerRow: {
    borderTopColor: p.border,
    borderTopWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: space.md,
  },
  feedbackError: { ...type.small, color: p.danger, textAlign: "center" },
  feedbackSuccess: { ...type.small, color: p.success, textAlign: "center" },
  loading: { alignItems: "center", justifyContent: "center", minHeight: 240 },
  mutedCenter: { ...type.small, color: p.textMuted, textAlign: "center" },
  qr: {
    alignSelf: "center",
    backgroundColor: p.surface,
    borderColor: p.border,
    borderRadius: employeeRadius.form,
    borderWidth: 1,
    height: 220,
    justifyContent: "center",
    overflow: "hidden",
    padding: space.sm,
    width: 220,
  },
  sheet: {
    backgroundColor: p.surface,
    borderColor: p.border,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    gap: space.lg,
    padding: space.screen,
  },
  sheetBackdrop: { backgroundColor: p.sheetOverlay, flex: 1 },
  sheetRoot: { flex: 1, justifyContent: "flex-end" },
  statusBody: { ...type.body, color: p.textSecondary },
  statusRow: { alignItems: "center", gap: space.xs },
}));
export const nativeGuestAccessStyles = nativeGuestAccessStylesTheme.light;
