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

  it("states that Shift start is unavailable instead of inventing it", () => {
    expect(getNativeShellCopy("en").noShiftBody).toContain(
      "Shift start is not available",
    );
    expect(getNativeShellCopy("ar").noShiftBody).toContain("غير متاح");
  });

  it("uses truthful blocked language for access and Location gaps", () => {
    const en = getNativeShellCopy("en");
    expect(en.accessDeniedBody).toContain("Protected work remains blocked");
    expect(en.noLocationTitle).toBe("No available Location");
    expect(en.authRecoveryTitle).toContain("restore sign-in");
    expect(en.authErrorTitle).toContain("sign-in unavailable");
  });
});
