import { describe, expect, it } from "vitest";

import {
  currencyMinorUnitExponent,
  currencyMinorUnitRegistrySource,
  isCurrencyAmountRepresentable,
} from "../src/common/financial/currency-minor-units";

describe("DEC-053 deterministic currency minor-unit authority", () => {
  it("records the reviewed SIX ISO 4217 List One snapshot", () => {
    expect(currencyMinorUnitRegistrySource).toEqual({
      authority: "SIX Financial Information, ISO 4217 Maintenance Agency",
      publishedOn: "2026-01-01",
      retrievedOn: "2026-08-16",
      url: "https://www.six-group.com/dam/download/financial-information/data-center/iso-currrency/lists/list-one.xml",
    });
  });

  it("accepts exact JOD mills and exact USD cents including trailing zero", () => {
    expect(currencyMinorUnitExponent("JOD")).toBe(3);
    expect(isCurrencyAmountRepresentable("JOD", 1_201n)).toBe(true);
    expect(currencyMinorUnitExponent("USD")).toBe(2);
    expect(isCurrencyAmountRepresentable("USD", 1_200n)).toBe(true);
    expect(isCurrencyAmountRepresentable("USD", 1_201n)).toBe(false);
  });

  it("enforces zero-exponent currencies without rounding", () => {
    expect(currencyMinorUnitExponent("JPY")).toBe(0);
    expect(isCurrencyAmountRepresentable("JPY", 1_000n)).toBe(true);
    expect(isCurrencyAmountRepresentable("JPY", 1_001n)).toBe(false);
  });

  it("fails closed for unknown, non-numeric, and exponent-above-storage codes", () => {
    expect(currencyMinorUnitExponent("ZZZ")).toBeUndefined();
    expect(currencyMinorUnitExponent("XAU")).toBeNull();
    expect(currencyMinorUnitExponent("CLF")).toBe(4);
    expect(isCurrencyAmountRepresentable("ZZZ", 1_000n)).toBe(false);
    expect(isCurrencyAmountRepresentable("XAU", 1_000n)).toBe(false);
    expect(isCurrencyAmountRepresentable("CLF", 1_000n)).toBe(false);
  });
});
