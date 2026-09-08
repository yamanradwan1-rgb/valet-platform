// Visual authority: apps/valet/src/app/globals.css and Employee Web primitives.
export const employeeColors = {
  warm: "#FAFAF8",
  white: "#FFFFFF",
  navy: "#07111F",
  navy2: "#0B1626",
  navy3: "#111E30",
  blue: "#176BFF",
  ice: "#EDF4FF",
  neutral: "#6F7C91",
  muted: "#8C98AA",
  border: "#DDE4EC",
  success: "#2F9B78",
  warning: "#D89434",
  danger: "#D95C63",
} as const;

export const employeeSpacing = {
  xs: 4,
  compact: 6,
  sm: 8,
  md: 12,
  lg: 16,
  screen: 20,
  hero: 24,
} as const;

export const employeeRadius = { primary: 16, form: 12, pill: 999 } as const;
export const employeeButtonHeights = {
  large: 56,
  standard: 44,
  compact: 36,
} as const;
export const employeeFieldHeights = {
  standard: 48,
  plate: 56,
  phone: 56,
} as const;
export const employeeMinimumTouchTarget = 48;

// Explicit Web Badge backgrounds; never a domain-state mapping.
export const employeeStatusColors = {
  neutral: { backgroundColor: "#F5F6F8", color: employeeColors.neutral },
  primary: { backgroundColor: employeeColors.ice, color: employeeColors.blue },
  success: { backgroundColor: "#EEFBF5", color: employeeColors.success },
  warning: { backgroundColor: "#FFF4E0", color: employeeColors.warning },
  danger: { backgroundColor: "#FFF0F0", color: employeeColors.danger },
} as const;

// Web Btn active blue and Tailwind gray-50/red-50, converted to sRGB for Native.
export const employeeFeedbackColors = {
  dangerPressed: "#8D1C1C",
  primaryPressed: "#0F5EEA",
  secondaryPressed: "#F9FAFB",
  errorSurface: "#FEF2F2",
  errorBorder: "#D95C6333", // Web border-vdanger/20.
} as const;
