import type { TextStyle } from "react-native";

export const employeeFontFamilies = {
  display: "Space Grotesk",
  ui: "Plus Jakarta Sans",
} as const;

export const employeeFontWeights = {
  bold: "700",
  extraBold: "800",
  medium: "500",
  regular: "400",
  semiBold: "600",
} as const satisfies Record<string, NonNullable<TextStyle["fontWeight"]>>;

export const employeeTypography = {
  body: {
    fontFamily: employeeFontFamilies.ui,
    fontSize: 14,
    fontWeight: employeeFontWeights.regular,
    lineHeight: 20,
  },
  small: {
    fontFamily: employeeFontFamilies.ui,
    fontSize: 12,
    fontWeight: employeeFontWeights.regular,
    lineHeight: 16,
  },
  label: {
    fontFamily: employeeFontFamilies.ui,
    fontSize: 14,
    fontWeight: employeeFontWeights.semiBold,
    lineHeight: 20,
  },
  header: {
    fontFamily: employeeFontFamilies.ui,
    fontSize: 17,
    fontWeight: employeeFontWeights.semiBold,
  },
  vehicle: {
    fontFamily: employeeFontFamilies.display,
    fontSize: 26,
    fontWeight: employeeFontWeights.bold,
    lineHeight: 32.5,
  },
  plate: {
    fontFamily: employeeFontFamilies.display,
    fontSize: 36,
    fontWeight: employeeFontWeights.bold,
  },
  button: {
    fontFamily: employeeFontFamilies.ui,
    fontSize: 15,
    fontWeight: employeeFontWeights.semiBold,
  },
  plateField: {
    fontFamily: employeeFontFamilies.display,
    fontSize: 20,
    fontWeight: employeeFontWeights.bold,
    lineHeight: 28,
  },
  phoneField: {
    fontFamily: employeeFontFamilies.ui,
    fontSize: 16,
    fontWeight: employeeFontWeights.regular,
    lineHeight: 24,
  },
  badge: {
    fontFamily: employeeFontFamilies.ui,
    fontSize: 10,
    fontWeight: employeeFontWeights.bold,
    letterSpacing: 0.5,
  },
} as const satisfies Record<string, TextStyle>;

export type EmployeeTextAlign = "left" | "right";
export type EmployeeTextKind = "identifier" | "human";

// Locale direction and visual alignment are independent: a plate can be LTR/center.
export function employeeTextStyle(
  kind: EmployeeTextKind,
  localeAlign: EmployeeTextAlign,
  alignment?: "left" | "right" | "center",
) {
  return {
    textAlign: alignment ?? (kind === "identifier" ? "left" : localeAlign),
    writingDirection:
      kind === "human" && localeAlign === "right"
        ? ("rtl" as const)
        : ("ltr" as const),
  };
}
