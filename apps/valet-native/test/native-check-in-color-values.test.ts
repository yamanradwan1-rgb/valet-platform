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

  it("caps after NFKC expansion while retaining valid decomposed input", () => {
    const ligatures = "ﬃ".repeat(80);
    const capped = capNativeCustomColor(ligatures);
    expect(capped).toBe("ﬃ".repeat(26));
    expect(serializeNativeCustomColor(ligatures)).toBe(capped);
    expect(Array.from(capped.trim().normalize("NFKC"))).toHaveLength(78);

    const decomposed = "A".repeat(79) + "e\u0301";
    expect(Array.from(decomposed)).toHaveLength(81);
    expect(Array.from(decomposed.trim().normalize("NFKC"))).toHaveLength(80);
    expect(capNativeCustomColor(decomposed)).toBe(decomposed);
    expect(serializeNativeCustomColor(decomposed)).toBe(decomposed);
  });
});
