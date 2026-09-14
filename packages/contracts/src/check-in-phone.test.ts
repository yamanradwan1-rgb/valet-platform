import { describe, expect, it } from "vitest";

import {
  intakeCustomerIntentSchema,
  jordanCheckInMobilePhoneSchema,
  normalizeJordanCheckInPhone,
} from "./check-in";

describe("Employee Check-In Jordan mobile contract", () => {
  it.each([
    "790000000",
    "0790000000",
    "+962790000000",
    "79 000 0000",
    "079 000 0000",
    "+962 79 000 0000",
  ])("normalizes %s to the canonical intake phone", (input) => {
    expect(normalizeJordanCheckInPhone(input)).toEqual({
      ok: true,
      phone: "+962790000000",
    });
  });

  it.each([
    "77896356",
    "+96277896356",
    "123456789",
    "071234567",
    "079000000",
    "07900000000",
    "+96279000000",
    "+9627900000000",
    "abc",
  ])("rejects malformed input %s", (input) => {
    expect(normalizeJordanCheckInPhone(input)).toEqual({ ok: false });
  });

  it("requires canonical Jordan mobile form at the wire boundary", () => {
    expect(
      jordanCheckInMobilePhoneSchema.safeParse("+962790000000").success,
    ).toBe(true);
    for (const phone of ["+96277896356", "+962123456789", "phone"]) {
      expect(
        intakeCustomerIntentSchema.safeParse({
          intent: "DIFFERENT_CUSTOMER",
          phone,
        }).success,
      ).toBe(false);
    }
  });
});
