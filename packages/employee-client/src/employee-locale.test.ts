import { describe, expect, it } from "vitest";

import {
  EMPLOYEE_LOCALES,
  employeeLocaleDirection,
  isEmployeeLocale,
} from "./employee-locale";

describe("portable Employee locale semantics", () => {
  it("keeps the accepted English and Arabic locale set", () => {
    expect(EMPLOYEE_LOCALES).toEqual(["en", "ar"]);
  });

  it("maps English to LTR and Arabic to RTL", () => {
    expect(employeeLocaleDirection("en")).toBe("ltr");
    expect(employeeLocaleDirection("ar")).toBe("rtl");
  });

  it("rejects unsupported locale values", () => {
    expect(isEmployeeLocale("en")).toBe(true);
    expect(isEmployeeLocale("ar")).toBe(true);
    expect(isEmployeeLocale("fr")).toBe(false);
    expect(isEmployeeLocale(undefined)).toBe(false);
  });
});
