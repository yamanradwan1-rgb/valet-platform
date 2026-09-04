import { describe, expect, it } from "vitest";
import {
  EMPLOYEE_LOCALES,
  employeeLocaleDirection,
} from "@valet/employee-client";
import {
  FOUNDATION_LOCALES,
  getFoundationPresentation,
} from "../src/foundation/foundation-locale";

describe("foundation locale presentation", () => {
  it("provides an English LTR presentation", () => {
    const presentation = getFoundationPresentation("en");

    expect(presentation.copy.audience).toBe("Employee");
    expect(presentation.copy.tasks).toBe("Tasks");
    expect(presentation.copy.status).toBe("Foundation ready");
    expect(presentation.direction).toBe("ltr");
    expect(presentation.textAlign).toBe("left");
  });

  it("provides an Arabic RTL presentation", () => {
    const presentation = getFoundationPresentation("ar");

    expect(presentation.copy.audience).toBe("الموظف");
    expect(presentation.copy.tasks).toBe("المهام");
    expect(presentation.copy.status).toBe("جاهز للتشغيل");
    expect(presentation.direction).toBe("rtl");
    expect(presentation.textAlign).toBe("right");
  });

  it("limits the foundation shell to the accepted locales", () => {
    expect(FOUNDATION_LOCALES).toEqual(["en", "ar"]);
  });

  it.each(EMPLOYEE_LOCALES)(
    "keeps the Native consumer on the portable %s direction contract",
    (locale) => {
      expect(getFoundationPresentation(locale).direction).toBe(
        employeeLocaleDirection(locale),
      );
    },
  );
});
