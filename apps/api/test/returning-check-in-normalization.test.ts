import { describe, expect, it } from "vitest";

import { maskCustomerPhoneSuffix } from "../src/modules/vehicles/returning-vehicle-recognition";
import { normalizeVehicleDetails } from "../src/modules/vehicles/vehicle-details-normalization";

function invalid(): never {
  throw new Error("INVALID");
}

describe("returning Check-In normalization", () => {
  it("masks a deterministic bounded digit suffix", () => {
    expect(maskCustomerPhoneSuffix("+962791234567")).toBe("4567");
    expect(maskCustomerPhoneSuffix("+12")).toBe("12");
    expect(maskCustomerPhoneSuffix("+123456789")).toHaveLength(4);
  });

  it("trims and NFKC-normalizes optional Vehicle details", () => {
    expect(
      normalizeVehicleDetails(
        { color: " Black ", make: " Ｔｏｙｏｔａ ", model: undefined },
        invalid,
      ),
    ).toEqual({ color: "Black", make: "Toyota", model: null });
    expect(normalizeVehicleDetails(undefined, invalid)).toEqual({
      color: null,
      make: null,
      model: null,
    });
  });

  it("rejects blank, overlong, unknown, and incomplete correction input", () => {
    expect(() => normalizeVehicleDetails({ make: " " }, invalid)).toThrow(
      "INVALID",
    );
    expect(() =>
      normalizeVehicleDetails({ make: "x".repeat(81) }, invalid),
    ).toThrow("INVALID");
    expect(() => normalizeVehicleDetails({ year: "2026" }, invalid)).toThrow(
      "INVALID",
    );
    expect(() =>
      normalizeVehicleDetails({ color: null, make: null }, invalid, true),
    ).toThrow("INVALID");
  });
});
