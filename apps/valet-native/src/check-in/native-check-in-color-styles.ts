import { createEmployeeStyles } from "../appearance/employee-themed-styles";
import { employeeFieldStylesTheme } from "../employee-ui/employee-fields";
import { employeeFontFamilies } from "../employee-ui/employee-typography";

export const nativeCheckInColorStylesTheme = createEmployeeStyles((p) => ({
  section: { alignSelf: "stretch" },
  heading: {
    ...employeeFieldStylesTheme[p.mode].label,
    marginBottom: 8,
  },
  grid: { gap: 4 },
  row: { flexDirection: "row", gap: 4 },
  tile: {
    alignItems: "center",
    backgroundColor: p.surface,
    borderColor: p.mode === "dark" ? p.border : "#7D8B9F",
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    gap: 3,
    justifyContent: "center",
    minHeight: 48,
    minWidth: 0,
    paddingHorizontal: 3,
    paddingVertical: 4,
  },
  selected: {
    backgroundColor: p.selectedSurface,
    borderColor: p.mode === "dark" ? p.linkPrimary : "#0F54CB",
    borderWidth: 2,
  },
  tileLabel: {
    color: p.textPrimary,
    fontFamily: employeeFontFamilies.ui,
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 14,
    textAlign: "center",
  },
  swatch: {
    borderColor: p.mode === "dark" ? p.textMuted : "#607189",
    borderRadius: 5,
    borderWidth: 1,
    height: 15,
    overflow: "hidden",
    width: 22,
  },
  selectedCheck: { position: "absolute", top: 5 },
  actions: { flexDirection: "row", gap: 4, marginTop: 4 },
  other: {
    alignItems: "center",
    backgroundColor: p.surface,
    borderColor: p.mode === "dark" ? p.border : "#7D8B9F",
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 48,
    paddingHorizontal: 12,
  },
  otherText: {
    color: p.mode === "dark" ? p.linkPrimary : "#0F54CB",
    fontFamily: employeeFontFamilies.ui,
    fontSize: 14,
    fontWeight: "600",
  },
  clear: { justifyContent: "center", minHeight: 48, paddingHorizontal: 8 },
  clearText: {
    color: p.mode === "dark" ? p.linkPrimary : "#0F54CB",
    fontFamily: employeeFontFamilies.ui,
    fontSize: 12,
    fontWeight: "600",
  },
  customInput: {
    ...employeeFieldStylesTheme[p.mode].field,
    height: 48,
    marginTop: 6,
  },
  customInputFocused: {
    borderColor: p.mode === "dark" ? p.linkPrimary : "#0F54CB",
    borderWidth: 2,
  },
}));
