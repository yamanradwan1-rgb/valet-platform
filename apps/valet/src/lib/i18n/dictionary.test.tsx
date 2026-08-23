import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  employeeDictionary,
  isEmployeeLocale,
  localeDir,
} from "./dictionary";

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

  it("validates the locale cookie value strictly", () => {
    expect(isEmployeeLocale("ar")).toBe(true);
    expect(isEmployeeLocale("en")).toBe(true);
    expect(isEmployeeLocale("fr")).toBe(false);
    expect(isEmployeeLocale(undefined)).toBe(false);
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
