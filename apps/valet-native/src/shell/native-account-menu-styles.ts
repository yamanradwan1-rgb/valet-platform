import { StyleSheet } from "react-native";

import {
  employeeColors as c,
  employeeSpacing as space,
} from "../employee-ui/employee-tokens";
import { employeeTypography as type } from "../employee-ui/employee-typography";

export const nativeAccountAvatarStyles = StyleSheet.create({
  avatar: {
    alignItems: "center",
    backgroundColor: c.navy3,
    borderRadius: 999,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  avatarPressed: { opacity: 0.7 },
});

export const nativeAccountMenuStyles = StyleSheet.create({
  closeButton: {
    alignItems: "center",
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  closeText: { color: c.neutral, fontSize: 28, lineHeight: 30 },
  content: { gap: space.md, paddingBottom: space.hero },
  handle: {
    alignSelf: "center",
    backgroundColor: c.border,
    borderRadius: 2,
    height: 4,
    width: 40,
  },
  heading: { ...type.pageTitle, color: c.navy, flex: 1 },
  headingRow: { alignItems: "center", flexDirection: "row", gap: space.sm },
  infoLabel: { ...type.small, color: c.neutral, flex: 1 },
  infoRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: space.md,
    minHeight: 32,
  },
  infoValue: { ...type.small, color: c.navy, flex: 1, fontWeight: "600" },
  language: {
    alignItems: "center",
    borderColor: c.border,
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    height: 44,
    justifyContent: "center",
  },
  languageSelected: { backgroundColor: c.ice, borderColor: c.blue },
  languageText: { ...type.body, color: c.neutral, fontWeight: "600" },
  languageTextSelected: { color: c.blue },
  languages: { flexDirection: "row", gap: space.sm },
  overlay: {
    backgroundColor: "#07111F66",
    flex: 1,
    justifyContent: "flex-end",
  },
  section: {
    backgroundColor: c.white,
    borderColor: c.border,
    borderRadius: 16,
    borderWidth: 1,
    gap: space.sm,
    padding: space.lg,
  },
  sectionTitle: {
    ...type.small,
    color: c.muted,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  sheet: {
    backgroundColor: c.warm,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    gap: space.md,
    maxHeight: "88%",
    paddingHorizontal: space.screen,
    paddingTop: space.md,
  },
});
