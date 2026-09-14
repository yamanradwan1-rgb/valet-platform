import { describe, expect, it } from "vitest";

import { normalizeIntakeRequest } from "../src/modules/valet-sessions/intake-session-normalization";

const base = {
  authenticatedUserId: "11111111-1111-4111-8111-111111111111",
  intakeOperationId: "intake:phone-test",
  targetLocationId: "22222222-2222-4222-8222-222222222222",
  vehicleIdentity: {
    mode: "TEMPORARY_DESCRIPTOR" as const,
    temporaryDescriptor: "Silver sedan",
  },
};

describe("intake command Jordan phone authority", () => {
  it("accepts the canonical phone unchanged", () => {
    expect(
      normalizeIntakeRequest({
        ...base,
        customer: {
          intent: "DIFFERENT_CUSTOMER",
          phone: "+962790000000",
        },
      }).customer,
    ).toMatchObject({ phoneNormalized: "+962790000000" });
  });

  it.each(["+96277896356", "+962123456789", "+96279000000"])(
    "rejects noncanonical phone %s as intake input",
    (phone) => {
      expect(() =>
        normalizeIntakeRequest({
          ...base,
          customer: { intent: "DIFFERENT_CUSTOMER", phone },
        }),
      ).toThrowError(expect.objectContaining({ code: "INTAKE_INPUT_INVALID" }));
    },
  );
});
