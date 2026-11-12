import { describe, expect, it } from "vitest";

import {
  capNativeCustomColor,
  nativeVehicleColorPresets,
  serializeNativeCustomColor,
} from "../src/check-in/native-check-in-color-values";

describe("#451 canonical vehicle color values", () => {
  it("keeps nine single-string persisted values, including Beige / Gold", () => {
    expect(nativeVehicleColorPresets.map(({ value }) => value)).toEqual([
      "White",
      "Black",
      "Silver",
      "Gray",
      "Blue",
      "Red",
      "Brown",
      "Beige / Gold",
      "Green",
    ]);
  });

  it("caps custom text at 80 Unicode code points and rejects blank after normalization", () => {
    expect(
      Array.from(capNativeCustomColor("X".repeat(79) + "🚗Z")),
    ).toHaveLength(80);
    expect(capNativeCustomColor("X".repeat(81))).toHaveLength(80);
    expect(
      Array.from(serializeNativeCustomColor("🚗".repeat(81))!),
    ).toHaveLength(80);
    expect(serializeNativeCustomColor("  \u3000 ")).toBeNull();
    expect(serializeNativeCustomColor("Midnight Plum")).toBe("Midnight Plum");
  });
});
