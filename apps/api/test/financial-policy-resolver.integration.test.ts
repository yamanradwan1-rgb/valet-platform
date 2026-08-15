import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { resolveEffectiveFinancialPolicy } from "../src/modules/payments/financial-policy-resolver";
import { PaymentTestContext } from "./payment-test-context";

const context = new PaymentTestContext("policy");

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

async function resolveFor(sessionId: string) {
  const transaction = await context.runtimePool.connect();
  try {
    await transaction.query("BEGIN");
    const scope = await transaction.query<{
      location_id: string;
      organization_id: string;
    }>(
      `SELECT organization_id::text, location_id::text
       FROM valet_sessions WHERE id = $1 FOR UPDATE`,
      [sessionId],
    );
    const row = scope.rows[0]!;
    const result = await resolveEffectiveFinancialPolicy(transaction, {
      locationId: row.location_id,
      organizationId: row.organization_id,
    });
    await transaction.query("ROLLBACK");
    return result;
  } finally {
    transaction.release();
  }
}

describe("VAL-008A effective financial policy", () => {
  it("resolves the exact safe Organization defaults", async () => {
    const fixture = await context.createPaymentFixture();
    await expect(resolveFor(fixture.sessionId)).resolves.toEqual({
      currency: "JOD",
      policy: {
        paymentMethodsPolicy: "CASH_ONLY",
        releaseRequiresPayment: false,
        servicePayer: "CUSTOMER",
        tipsEnabled: false,
        validationEnabled: false,
        valetServiceFee: "0.000",
      },
    });
  });

  it("lets every Location override win independently while null inherits", async () => {
    const overridden = await context.createPaymentFixture({
      currency: "AED",
      locationFeeOverride: "7.125",
      locationMethodsOverride: "CASH_OR_DIGITAL",
      locationPayerOverride: "VENUE",
      locationReleaseOverride: false,
      locationTipsOverride: true,
      locationValidationOverride: false,
      organizationFee: "4.500",
      organizationMethods: "DIGITAL_ONLY",
      organizationPayer: "CUSTOMER",
      organizationRelease: true,
      organizationTips: false,
      organizationValidation: true,
    });
    expect(await resolveFor(overridden.sessionId)).toEqual({
      currency: "AED",
      policy: {
        paymentMethodsPolicy: "CASH_OR_DIGITAL",
        releaseRequiresPayment: false,
        servicePayer: "VENUE",
        tipsEnabled: true,
        validationEnabled: false,
        valetServiceFee: "7.125",
      },
    });

    const inherited = await context.createPaymentFixture({
      organizationFee: "4.500",
      organizationMethods: "DIGITAL_ONLY",
      organizationPayer: "VENUE",
      organizationRelease: true,
      organizationTips: true,
      organizationValidation: true,
    });
    expect((await resolveFor(inherited.sessionId)).policy).toEqual({
      paymentMethodsPolicy: "DIGITAL_ONLY",
      releaseRequiresPayment: true,
      servicePayer: "VENUE",
      tipsEnabled: true,
      validationEnabled: true,
      valetServiceFee: "4.500",
    });
  });
});
