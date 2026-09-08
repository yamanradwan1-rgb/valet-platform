import { describe, expect, it } from "vitest";

import { nativeParkingBackBlocked } from "../src/parking/native-parking-protection";

describe("MOB-012B protected Native navigation", () => {
  it.each([
    ["submitting", "ready"],
    ["reconciling", "ready"],
    ["started", "submitting"],
    ["started", "reconciling"],
  ] as const)("blocks Back for %s / %s", (start, confirmation) => {
    expect(nativeParkingBackBlocked(start, confirmation)).toBe(true);
  });

  it("allows Back outside protected Start/Confirm attempts", () => {
    expect(nativeParkingBackBlocked("started", "ready")).toBe(false);
    expect(nativeParkingBackBlocked("accepted", "inactive")).toBe(false);
  });
});
