export type EmployeeAppearanceMode = "light" | "dark";

// Literal design colors remain immutable in employee-tokens. Presentation uses
// these semantic roles; the Light values reproduce the pushed #226 baseline.
export const employeeLightPalette = Object.freeze({
  mode: "light" as EmployeeAppearanceMode,
  appBackground: "#FAFAF8",
  surface: "#FFFFFF",
  inputSurface: "#FFFFFF",
  textPrimary: "#07111F",
  textSecondary: "#6F7C91",
  textMuted: "#8C98AA",
  border: "#DDE4EC",
  actionPrimary: "#176BFF",
  linkPrimary: "#176BFF",
  selectedSurface: "#EDF4FF",
  onAction: "#FFFFFF",
  inverseSurface: "#07111F",
  inverseElevated: "#0B1626",
  inverseRaised: "#111E30",
  shadow: "#07111F",
  actionSuccess: "#2F9B78",
  success: "#2F9B78",
  warning: "#D89434",
  actionWarning: "#D89434",
  actionDanger: "#D95C63",
  danger: "#D95C63",
  statusNeutralSurface: "#F5F6F8",
  successSurface: "#EEFBF5",
  successSoftSurface: "#F0FFF8",
  warningSurface: "#FFF4E0",
  dangerSurface: "#FFF0F0",
  primaryPressed: "#0F5EEA",
  secondaryPressed: "#F9FAFB",
  errorSurface: "#FEF2F2",
  errorBorder: "#D95C6333",
  successBorder: "#2F9B7833",
  warningBorder: "#D8943433",
  attentionBorder: "#176BFF40",
  handoffWarningSurface: "#FFFBEB",
  handoffWarningBorder: "#FCD34D",
  handoffWarningText: "#92400E",
  disabledSurface: "#D1D5DB",
  disabledText: "#4B5563",
  skeleton: "#E5E7EB",
  skeletonSoft: "#F3F4F6",
  sheetOverlay: "#07111F99",
  accountOverlay: "#07111F66",
  pickerOverlay: "rgba(7, 17, 31, 0.42)",
  cameraMessageSurface: "rgba(255, 255, 255, 0.95)",
  gateInputSurface: "#FFFFFF14",
  gateInputBorder: "#FFFFFF26",
  gateErrorSurface: "#EF44441A",
  gateErrorBorder: "#F871714D",
  gateErrorText: "#FCA5A5",
  gateErrorTitle: "#FECACA",
  gateErrorBody: "#FECACACC",
  gateCardSurface: "#FFFFFF0F",
  gateCardBorder: "#FFFFFF1A",
  gateLocationSurface: "#FFFFFF0A",
  gateSelectedSurface: "#176BFF33",
  gateGradient: "#0B2D6E",
});

export type EmployeePalette = {
  readonly [K in keyof typeof employeeLightPalette]: K extends "mode"
    ? EmployeeAppearanceMode
    : string;
};

export const employeeDarkPalette: EmployeePalette = Object.freeze({
  ...employeeLightPalette,
  mode: "dark",
  appBackground: "#07111F",
  surface: "#111E30",
  inputSurface: "#0B1626",
  textPrimary: "#F3F6FC",
  textSecondary: "#B5C2D6",
  textMuted: "#9AAAC1",
  border: "#586F8D",
  linkPrimary: "#80B0FF",
  selectedSurface: "#142D52",
  success: "#6DD5B3",
  warning: "#F2BC67",
  actionWarning: "#8F5C1B",
  actionSuccess: "#217356",
  actionDanger: "#AD3D48",
  danger: "#FF9DA4",
  statusNeutralSurface: "#1C2A40",
  successSurface: "#10352D",
  successSoftSurface: "#133B31",
  warningSurface: "#362B1A",
  dangerSurface: "#3B202B",
  secondaryPressed: "#1C2A40",
  errorSurface: "#3B202B",
  errorBorder: "#9D515B",
  successBorder: "#337F6A",
  warningBorder: "#94713C",
  attentionBorder: "#3C68A7",
  handoffWarningSurface: "#362B1A",
  handoffWarningBorder: "#94713C",
  handoffWarningText: "#F2BC67",
  disabledSurface: "#28364C",
  disabledText: "#BAC6D8",
  skeleton: "#28364C",
  skeletonSoft: "#1C2A40",
  sheetOverlay: "#00000099",
  accountOverlay: "#00000066",
  pickerOverlay: "rgba(0, 0, 0, 0.6)",
  cameraMessageSurface: "rgba(17, 30, 48, 0.95)",
});

export const employeePalettes: Readonly<
  Record<EmployeeAppearanceMode, EmployeePalette>
> = Object.freeze({
  light: employeeLightPalette,
  dark: employeeDarkPalette,
});

export function employeeStatusPalette(p: EmployeePalette) {
  const status = (backgroundColor: string, color: string) => ({
    backgroundColor,
    color,
    dotColor: color,
  });
  return {
    neutral: status(p.statusNeutralSurface, p.textSecondary),
    primary: status(p.selectedSurface, p.linkPrimary),
    success: status(p.successSurface, p.success),
    successSoft: status(p.successSoftSurface, p.success),
    warning: status(p.warningSurface, p.warning),
    danger: status(p.dangerSurface, p.danger),
  };
}
