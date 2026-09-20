import { describe, expect, it } from "vitest";

import { directionForLocale, isDashboardLocale } from "./locale";

describe("dashboard locale", () => {
  it("maps English to LTR and Arabic to RTL", () => {
    expect(directionForLocale("en")).toBe("ltr");
    expect(directionForLocale("ar")).toBe("rtl");
  });

  it("accepts only supported presentation locales", () => {
    expect(isDashboardLocale("en")).toBe(true);
    expect(isDashboardLocale("ar")).toBe(true);
    expect(isDashboardLocale("fr")).toBe(false);
  });
});
