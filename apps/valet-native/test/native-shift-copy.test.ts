import { describe, expect, it } from "vitest";

import { getNativeShiftCopy } from "../src/shift/native-shift-copy";

describe("Native Shift localization", () => {
  it("defines distinct EN and AR copy for every bounded Shift field", () => {
    const en = getNativeShiftCopy("en");
    const ar = getNativeShiftCopy("ar");

    expect(Object.keys(ar).sort()).toEqual(Object.keys(en).sort());
    for (const key of Object.keys(en) as Array<keyof typeof en>) {
      expect(en[key].trim()).not.toBe("");
      expect(ar[key].trim()).not.toBe("");
      expect(ar[key]).not.toBe(en[key]);
    }
  });

  it("reuses the current Web Start Shift action and recovery copy", () => {
    const en = getNativeShiftCopy("en");
    const ar = getNativeShiftCopy("ar");

    expect(en.start).toBe("Start Shift");
    expect(en.starting).toBe("Starting shift...");
    expect(en.uncertainTitle).toBe("Confirm your start shift result");
    expect(ar.start).toBe("بدء المناوبة");
    expect(ar.starting).toBe("جارٍ بدء المناوبة...");
    expect(ar.uncertainTitle).toBe("أكّد نتيجة بدء المناوبة");
  });
});
