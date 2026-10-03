import { createEmployeeStyles } from "../appearance/employee-themed-styles";
import {
  employeeFontFamilies,
  employeeFontWeights,
} from "../employee-ui/employee-typography";
export const nativeGateStylesTheme = createEmployeeStyles((p) => ({
  actionStack: { gap: 12, width: "100%" },
  body: {
    color: p.textMuted,
    fontFamily: employeeFontFamilies.ui,
    fontSize: 14,
    fontWeight: employeeFontWeights.regular,
    lineHeight: 22.75,
  },
  errorBody: { color: p.gateErrorBody },
  errorTitle: { color: p.gateErrorTitle },
  loadingLabel: {
    color: p.onAction,
    fontFamily: employeeFontFamilies.ui,
    fontSize: 14,
    fontWeight: employeeFontWeights.semiBold,
    lineHeight: 20,
  },
  loadingStack: { alignItems: "center", gap: 24 },
  title: {
    color: p.onAction,
    fontFamily: employeeFontFamilies.display,
    fontSize: 20,
    fontWeight: employeeFontWeights.bold,
    lineHeight: 28,
    marginBottom: 8,
  },
}));
export const nativeGateStyles = nativeGateStylesTheme.light;

export const nativeGateControlStylesTheme = createEmployeeStyles((p) => ({
  button: {
    alignItems: "center",
    backgroundColor: p.actionPrimary,
    borderRadius: 16,
    justifyContent: "center",
    shadowColor: p.actionPrimary,
    shadowOffset: { height: 4, width: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    width: "100%",
  },
  buttonLabel: {
    color: p.onAction,
    fontFamily: employeeFontFamilies.ui,
    fontSize: 14,
    fontWeight: employeeFontWeights.bold,
    lineHeight: 20,
  },
  blur: { bottom: 0, left: 0, position: "absolute", right: 0, top: 0 },
  card: {
    backgroundColor: p.gateCardSurface,
    borderColor: p.gateCardBorder,
    borderRadius: 24,
    borderWidth: 1,
    overflow: "hidden",
    padding: 24,
    width: "100%",
  },
  disabled: { opacity: 0.6 },
  errorCard: {
    backgroundColor: p.gateErrorSurface,
    borderColor: p.gateErrorBorder,
  },
  localeSelected: {
    color: p.linkPrimary,
    fontFamily: employeeFontFamilies.ui,
    fontSize: 12,
    fontWeight: employeeFontWeights.extraBold,
    lineHeight: 16,
  },
  localeToggle: {
    alignItems: "center",
    alignSelf: "center",
    flexDirection: "row",
    gap: 4,
  },
  localeUnselected: {
    color: p.textMuted,
    fontFamily: employeeFontFamilies.ui,
    fontSize: 12,
    fontWeight: employeeFontWeights.bold,
    lineHeight: 16,
  },
  loginButton: { height: 56 },
  loginButtonLabel: { fontSize: 16, lineHeight: 24 },
  pressed: { transform: [{ scale: 0.98 }] },
  secondaryButton: { backgroundColor: "transparent", shadowOpacity: 0 },
  secondaryButtonHeight: { height: 44 },
  secondaryButtonLabel: {
    color: p.textMuted,
    fontWeight: employeeFontWeights.semiBold,
  },
  spinner: {
    borderColor: p.linkPrimary,
    borderRadius: 16,
    borderTopColor: "transparent",
    borderWidth: 4,
    height: 32,
    width: 32,
  },
  standardButton: { height: 48 },
}));
export const nativeGateControlStyles = nativeGateControlStylesTheme.light;
