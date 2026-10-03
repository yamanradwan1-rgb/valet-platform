import { createEmployeeStyles } from "../appearance/employee-themed-styles";

import { employeeSpacing as space } from "../employee-ui/employee-tokens";
import { employeeTypography as type } from "../employee-ui/employee-typography";

export const nativeAccountAvatarStylesTheme = createEmployeeStyles((p) => ({
  avatar: {
    alignItems: "center",
    backgroundColor: p.inverseRaised,
    borderRadius: 999,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  avatarPressed: { opacity: 0.7 },
}));
export const nativeAccountAvatarStyles = nativeAccountAvatarStylesTheme.light;

export const nativeAccountMenuStylesTheme = createEmployeeStyles((p) => ({
  closeButton: {
    alignItems: "center",
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  closeText: { color: p.textSecondary, fontSize: 28, lineHeight: 30 },
  content: { gap: space.md, paddingBottom: space.hero },
  handle: {
    alignSelf: "center",
    backgroundColor: p.border,
    borderRadius: 2,
    height: 4,
    width: 40,
  },
  heading: { ...type.pageTitle, color: p.textPrimary, flex: 1 },
  headingRow: { alignItems: "center", flexDirection: "row", gap: space.sm },
  infoLabel: { ...type.small, color: p.textSecondary, flex: 1 },
  infoRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: space.md,
    minHeight: 32,
  },
  infoValue: {
    ...type.small,
    color: p.textPrimary,
    flex: 1,
    fontWeight: "600",
  },
  language: {
    alignItems: "center",
    borderColor: p.border,
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    height: 44,
    justifyContent: "center",
  },
  languageSelected: {
    backgroundColor: p.selectedSurface,
    borderColor: p.linkPrimary,
  },
  languageText: { ...type.body, color: p.textSecondary, fontWeight: "600" },
  languageTextSelected: { color: p.linkPrimary },
  languages: { flexDirection: "row", gap: space.sm },
  overlay: {
    backgroundColor: p.accountOverlay,
    flex: 1,
    justifyContent: "flex-end",
  },
  section: {
    backgroundColor: p.surface,
    borderColor: p.border,
    borderRadius: 16,
    borderWidth: 1,
    gap: space.sm,
    padding: space.lg,
  },
  sectionTitle: {
    ...type.small,
    color: p.textMuted,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  sheet: {
    backgroundColor: p.appBackground,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    gap: space.md,
    maxHeight: "88%",
    paddingHorizontal: space.screen,
    paddingTop: space.md,
  },
}));
export const nativeAccountMenuStyles = nativeAccountMenuStylesTheme.light;
