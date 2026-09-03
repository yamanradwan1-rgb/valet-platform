import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  EMPLOYEE_LOCALES,
  employeeLocaleDirection,
} from "@valet/employee-client";

import { employeeDictionary, isEmployeeLocale, localeDir } from "./dictionary";

describe("employee i18n dictionary", () => {
  it("provides en and ar dictionaries with identical key sets", () => {
    const en = employeeDictionary("en");
    const ar = employeeDictionary("ar");
    expect(Object.keys(en).sort()).toEqual(Object.keys(ar).sort());
    for (const key of Object.keys(en) as Array<keyof typeof en>) {
      expect(typeof ar[key]).toBe("string");
      expect((ar[key] as string).length).toBeGreaterThan(0);
    }
  });

  it("maps Arabic to rtl and English to ltr", () => {
    expect(localeDir("ar")).toBe("rtl");
    expect(localeDir("en")).toBe("ltr");
  });

  it.each(EMPLOYEE_LOCALES)(
    "keeps the Web consumer on the portable %s direction contract",
    (locale) => {
      expect(localeDir(locale)).toBe(employeeLocaleDirection(locale));
    },
  );

  it("validates the locale cookie value strictly", () => {
    expect(isEmployeeLocale("ar")).toBe(true);
    expect(isEmployeeLocale("en")).toBe(true);
    expect(isEmployeeLocale("fr")).toBe(false);
    expect(isEmployeeLocale(undefined)).toBe(false);
  });

  it("carries the DEC-068 post-parking key binding copy in both locales", () => {
    const en = employeeDictionary("en");
    const ar = employeeDictionary("ar");
    // Physical instruction: place key into ANY free slot, then scan/enter it.
    expect(en.returnKeyAvailable).toContain("available free slot");
    expect(ar.returnKeyAvailable).toContain("خانة");
    // Lost-race/unavailable retry hint locked by DEC-068 §23.
    expect(en.keySlotUnavailableRetry).toBe(
      "This key slot is no longer available. Scan another slot.",
    );
    expect(ar.keySlotUnavailableRetry).toBe(
      "هذه الخانة لم تعد متاحة. امسح خانة أخرى.",
    );
    // Established terminology stays intact.
    expect(en.scanKeySlot).toBe("Scan key slot");
    expect(ar.scanKeySlot).toBe("امسح رمز خانة المفتاح");
    expect(en.vehicleParkedAndKeyReturned).toBe(
      "Vehicle parked and key returned",
    );
    expect(ar.vehicleParkedAndKeyReturned).toBe("تم صف السيارة وإعادة المفتاح");
  });
});

describe("locale rendering", () => {
  function shell(lang: string, dir: string): string {
    return renderToStaticMarkup(
      <html lang={lang} dir={dir}>
        <body>x</body>
      </html>,
    );
  }

  it("renders html with arabic rtl direction", () => {
    const markup = shell("ar", "rtl");
    expect(markup).toContain('lang="ar"');
    expect(markup).toContain('dir="rtl"');
  });

  it("renders html with english ltr direction", () => {
    const markup = shell("en", "ltr");
    expect(markup).toContain('lang="en"');
    expect(markup).toContain('dir="ltr"');
  });
});
