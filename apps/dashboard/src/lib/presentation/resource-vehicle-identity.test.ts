import { describe, expect, it } from "vitest";

import { resourceVehicleIdentity } from "./resource-vehicle-identity";

describe("resource vehicle identity", () => {
  it("prefers the plate, then truthful descriptor, then localized unavailable", () => {
    expect(
      resourceVehicleIdentity(
        { plateNumberNormalized: " 12345 ", temporaryDescriptor: "Blue car" },
        "en",
      ),
    ).toEqual({ label: "12345", dir: "ltr" });
    expect(
      resourceVehicleIdentity(
        { plateNumberNormalized: null, temporaryDescriptor: " سيارة زرقاء " },
        "ar",
      ),
    ).toEqual({ label: "سيارة زرقاء", dir: "auto" });
    expect(
      resourceVehicleIdentity(
        { plateNumberNormalized: " ", temporaryDescriptor: " " },
        "en",
      ).label,
    ).toBe("Vehicle identity unavailable");
    expect(resourceVehicleIdentity(null, "ar").label).toBe(
      "هوية المركبة غير متاحة",
    );
  });
});
