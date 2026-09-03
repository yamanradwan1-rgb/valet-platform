export const EMPLOYEE_LOCALES = ["en", "ar"] as const;

export type EmployeeLocale = (typeof EMPLOYEE_LOCALES)[number];
export type EmployeeTextDirection = "ltr" | "rtl";

export function isEmployeeLocale(value: unknown): value is EmployeeLocale {
  return value === "en" || value === "ar";
}

export function employeeLocaleDirection(
  locale: EmployeeLocale,
): EmployeeTextDirection {
  return locale === "ar" ? "rtl" : "ltr";
}
