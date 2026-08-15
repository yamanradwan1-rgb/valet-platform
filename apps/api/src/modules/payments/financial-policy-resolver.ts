import type { PostgresTransaction } from "../../common/database/postgres";
import type {
  AuthoritativeFinancialContext,
  PaymentMethodsPolicy,
  PaymentServicePayer,
} from "./payment-types";

interface FinancialPolicyRow {
  readonly currency: string;
  readonly payment_methods_policy: PaymentMethodsPolicy;
  readonly payment_service_payer: PaymentServicePayer;
  readonly release_requires_payment: boolean;
  readonly tips_enabled: boolean;
  readonly validation_enabled: boolean;
  readonly valet_service_fee: string;
}

export async function resolveEffectiveFinancialPolicy(
  transaction: PostgresTransaction,
  scope: { readonly locationId: string; readonly organizationId: string },
): Promise<AuthoritativeFinancialContext> {
  const result = await transaction.query<FinancialPolicyRow>(
    `SELECT location.currency,
            COALESCE(location.valet_service_fee_override,
                     organization.valet_service_fee)::text
              AS valet_service_fee,
            COALESCE(location.payment_service_payer_override,
                     organization.payment_service_payer)::text
              AS payment_service_payer,
            COALESCE(location.payment_methods_policy_override,
                     organization.payment_methods_policy)::text
              AS payment_methods_policy,
            COALESCE(location.tips_enabled_override,
                     organization.tips_enabled) AS tips_enabled,
            COALESCE(location.validation_enabled_override,
                     organization.validation_enabled) AS validation_enabled,
            COALESCE(location.release_requires_payment_override,
                     organization.release_requires_payment)
              AS release_requires_payment
     FROM organizations AS organization
     INNER JOIN locations AS location
       ON location.organization_id = organization.id
      AND location.id = $2
     WHERE organization.id = $1
     FOR SHARE OF organization, location`,
    [scope.organizationId, scope.locationId],
  );
  const row = result.rows[0];
  if (result.rowCount !== 1 || row === undefined) {
    throw new Error("Financial policy scope is missing.");
  }
  return {
    currency: row.currency,
    policy: {
      paymentMethodsPolicy: row.payment_methods_policy,
      releaseRequiresPayment: row.release_requires_payment,
      servicePayer: row.payment_service_payer,
      tipsEnabled: row.tips_enabled,
      validationEnabled: row.validation_enabled,
      valetServiceFee: row.valet_service_fee,
    },
  };
}
