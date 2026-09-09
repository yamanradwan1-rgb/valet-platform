import { describe, expect, it } from "vitest";

import { getNativeShellCopy } from "../src/shell/native-shell-copy";

describe("Native production shell localization", () => {
  it("defines EN and AR for every shell state and action", () => {
    const en = getNativeShellCopy("en");
    const ar = getNativeShellCopy("ar");
    expect(Object.keys(ar).sort()).toEqual(Object.keys(en).sort());
    for (const key of Object.keys(en) as Array<keyof typeof en>) {
      expect(en[key].trim()).not.toBe("");
      expect(ar[key].trim()).not.toBe("");
      expect(ar[key]).not.toBe(en[key]);
    }
  });

  it("uses the current Web-aligned Start Shift prompt", () => {
    expect(getNativeShellCopy("en").noShiftBody).toBe(
      "Start a shift to begin operational work.",
    );
    expect(getNativeShellCopy("ar").noShiftBody).toBe(
      "ابدأ مناوبة لبدء العمل التشغيلي.",
    );
  });

  it("uses truthful blocked language for access and Location gaps", () => {
    const en = getNativeShellCopy("en");
    expect(en.accessDeniedBody).toContain("Protected work remains blocked");
    expect(en.noLocationTitle).toBe("No available Location");
    expect(en.authRecoveryTitle).toContain("restore sign-in");
    expect(en.authErrorTitle).toContain("sign-in unavailable");
  });

  it("uses the exact Employee Web navigation labels", () => {
    expect(getNativeShellCopy("en")).toMatchObject({
      scan: "Scan",
      shiftNav: "Shift",
      tasks: "Tasks",
      vehicles: "Vehicles",
    });
    expect(getNativeShellCopy("ar")).toMatchObject({
      scan: "مسح",
      shiftNav: "المناوبة",
      tasks: "المهام",
      vehicles: "المركبات",
    });
  });
});
