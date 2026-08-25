import { describe, expect, it } from "vitest";

import { isCashEntryValid, normalizeCashEntry } from "./cash-entry";

describe("VUI-011A Live Shift cash entry validation", () => {
  it("accepts an explicitly typed zero as a valid reported amount", () => {
    expect(isCashEntryValid("0")).toBe(true);
    expect(isCashEntryValid("0.000")).toBe(true);
    expect(normalizeCashEntry("0")).toBe("0");
  });

  it("rejects empty and non-numeric entry instead of defaulting to zero", () => {
    expect(isCashEntryValid("")).toBe(false);
    expect(isCashEntryValid("   ")).toBe(false);
    expect(isCashEntryValid("-1")).toBe(false);
    expect(isCashEntryValid("12,5")).toBe(false);
  });

  it("trims surrounding whitespace before applying the money contract", () => {
    expect(normalizeCashEntry(" 12.500 ")).toBe("12.500");
    expect(isCashEntryValid(" 12.500 ")).toBe(true);
  });
});
