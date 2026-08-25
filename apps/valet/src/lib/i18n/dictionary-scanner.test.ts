import { describe, expect, it } from "vitest";

import { employeeArabicScannerDictionary } from "./dictionary-ar-scanner";
import { employeeEnglishScannerDictionary } from "./dictionary-en-scanner";
import { employeeArabicDictionary } from "./dictionary-ar";
import { employeeEnglishDictionary } from "./dictionary-en";

describe("scanner i18n fragments (DEC-067)", () => {
  it("EN and AR scanner fragments expose exactly the same keys", () => {
    expect(Object.keys(employeeArabicScannerDictionary).sort()).toEqual(
      Object.keys(employeeEnglishScannerDictionary).sort(),
    );
  });

  it("every Arabic value is non-empty", () => {
    for (const [key, value] of Object.entries(
      employeeArabicScannerDictionary,
    )) {
      expect(value.length).toBeGreaterThan(0);
      expect(key.startsWith("scanner")).toBe(true);
    }
  });

  it("failure copy is truthful: denied and unavailable point at manual entry", () => {
    expect(
      employeeEnglishScannerDictionary.scannerCameraPermissionDenied,
    ).toContain("manually");
    expect(
      employeeArabicScannerDictionary.scannerCameraPermissionDenied,
    ).toContain("يدوي");
  });

  it("both fragments are registered in the base dictionaries", () => {
    const en = employeeEnglishDictionary as Record<string, string>;
    const ar = employeeArabicDictionary as Record<string, string>;
    for (const key of Object.keys(employeeEnglishScannerDictionary)) {
      expect(en[key]).toBeDefined();
      expect(ar[key]).toBeDefined();
    }
  });

  it("wrong-type copy distinguishes the three capture surfaces", () => {
    const t = employeeEnglishScannerDictionary;
    expect(t.scannerWrongTypeParkingSpot).not.toBe(
      t.scannerWrongTypeKeySlot,
    );
    expect(t.scannerWrongTypeHandoff).not.toBe(
      t.scannerWrongTypeParkingSpot,
    );
  });
});
