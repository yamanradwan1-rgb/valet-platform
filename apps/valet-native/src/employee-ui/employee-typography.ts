import type { TextStyle } from "react-native";

// Temporary system fonts: fontFamily is intentionally UNSET until Patch 7.
// body/controls -> Plus Jakarta Sans; identity/plate -> Space Grotesk.
export const employeeTypography = {
  body: { fontSize: 14, lineHeight: 20 },
  small: { fontSize: 12, lineHeight: 16 },
  label: { fontSize: 14, lineHeight: 20, fontWeight: "600" },
  header: { fontSize: 17, fontWeight: "600" },
  vehicle: { fontSize: 26, lineHeight: 32.5, fontWeight: "700" },
  plate: { fontSize: 36, fontWeight: "700" },
  button: { fontSize: 15, fontWeight: "600" },
  plateField: { fontSize: 20, lineHeight: 28, fontWeight: "700" },
  phoneField: { fontSize: 16, lineHeight: 24 },
  badge: { fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
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
