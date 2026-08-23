import type { PostgresTransaction } from "../../common/database/postgres";
import type { ConfigurationSettingProjection } from "@valet/contracts";

interface LocationConfigurationRow {
  readonly checkInPhotosRequiredDefault: boolean;
  readonly checkInPhotosRequiredOverride: boolean | null;
  readonly handoffStandardMethodPolicyDefault:
    | "PICKUP_CODE"
    | "DYNAMIC_QR"
    | "EITHER";
  readonly handoffStandardMethodPolicyOverride:
    | "PICKUP_CODE"
    | "DYNAMIC_QR"
    | "EITHER"
    | null;
  readonly trackingEnabledDefault: boolean;
  readonly trackingEnabledOverride: boolean | null;
  readonly rawGpsRetentionDaysDefault: number;
  readonly rawGpsRetentionDaysOverride: number | null;
  readonly valetServiceFeeDefault: string;
  readonly valetServiceFeeOverride: string | null;
  readonly paymentServicePayerDefault: "CUSTOMER" | "VENUE";
  readonly paymentServicePayerOverride: "CUSTOMER" | "VENUE" | null;
  readonly paymentMethodsPolicyDefault:
    | "CASH_ONLY"
    | "DIGITAL_ONLY"
    | "CASH_OR_DIGITAL";
  readonly paymentMethodsPolicyOverride:
    | "CASH_ONLY"
    | "DIGITAL_ONLY"
    | "CASH_OR_DIGITAL"
    | null;
  readonly tipsEnabledDefault: boolean;
  readonly tipsEnabledOverride: boolean | null;
  readonly validationEnabledDefault: boolean;
  readonly validationEnabledOverride: boolean | null;
  readonly releaseRequiresPaymentDefault: boolean;
  readonly releaseRequiresPaymentOverride: boolean | null;
}

const projectionRowSelection = `
     organization.check_in_photos_required
       AS "checkInPhotosRequiredDefault",
     location.check_in_photos_required_override
       AS "checkInPhotosRequiredOverride",
     organization.handoff_standard_method_policy::text
       AS "handoffStandardMethodPolicyDefault",
     location.handoff_standard_method_policy_override::text
       AS "handoffStandardMethodPolicyOverride",
     organization.tracking_enabled AS "trackingEnabledDefault",
     location.tracking_enabled_override AS "trackingEnabledOverride",
     organization.raw_gps_retention_days AS "rawGpsRetentionDaysDefault",
     location.raw_gps_retention_days_override
       AS "rawGpsRetentionDaysOverride",
     organization.valet_service_fee::text AS "valetServiceFeeDefault",
     location.valet_service_fee_override::text
       AS "valetServiceFeeOverride",
     organization.payment_service_payer::text
       AS "paymentServicePayerDefault",
     location.payment_service_payer_override::text
       AS "paymentServicePayerOverride",
     organization.payment_methods_policy::text
       AS "paymentMethodsPolicyDefault",
     location.payment_methods_policy_override::text
       AS "paymentMethodsPolicyOverride",
     organization.tips_enabled AS "tipsEnabledDefault",
     location.tips_enabled_override AS "tipsEnabledOverride",
     organization.validation_enabled AS "validationEnabledDefault",
     location.validation_enabled_override
       AS "validationEnabledOverride",
     organization.release_requires_payment
       AS "releaseRequiresPaymentDefault",
     location.release_requires_payment_override
       AS "releaseRequiresPaymentOverride"
`;

export interface LocationConfigurationContext {
  readonly currency: string;
  readonly row: LocationConfigurationRow;
  readonly timezone: string;
  readonly updatedAt: Date;
}

function projection(
  setting:
    | "checkInPhotosRequired"
    | "trackingEnabled"
    | "tipsEnabled"
    | "validationEnabled"
    | "releaseRequiresPayment",
  fallback: boolean,
  override: boolean | null,
): ConfigurationSettingProjection {
  return {
    default: fallback,
    effective: override ?? fallback,
    override: override === null ? null : override,
    overridePresent: override !== null,
    setting,
  };
}

export function buildSettingProjections(
  row: LocationConfigurationRow,
): ConfigurationSettingProjection[] {
  return [
    projection(
      "checkInPhotosRequired",
      row.checkInPhotosRequiredDefault,
      row.checkInPhotosRequiredOverride,
    ),
    {
      default: row.handoffStandardMethodPolicyDefault,
      effective:
        row.handoffStandardMethodPolicyOverride ??
        row.handoffStandardMethodPolicyDefault,
      override: row.handoffStandardMethodPolicyOverride,
      overridePresent: row.handoffStandardMethodPolicyOverride !== null,
      setting: "handoffStandardMethodPolicy",
    },
    projection("trackingEnabled", row.trackingEnabledDefault, row.trackingEnabledOverride),
    {
      default: row.rawGpsRetentionDaysDefault,
      effective:
        row.rawGpsRetentionDaysOverride ?? row.rawGpsRetentionDaysDefault,
      override: row.rawGpsRetentionDaysOverride,
      overridePresent: row.rawGpsRetentionDaysOverride !== null,
      setting: "rawGpsRetentionDays",
    },
    {
      default: row.valetServiceFeeDefault,
      effective: row.valetServiceFeeOverride ?? row.valetServiceFeeDefault,
      override: row.valetServiceFeeOverride,
      overridePresent: row.valetServiceFeeOverride !== null,
      setting: "valetServiceFee",
    },
    {
      default: row.paymentServicePayerDefault,
      effective:
        row.paymentServicePayerOverride ?? row.paymentServicePayerDefault,
      override: row.paymentServicePayerOverride,
      overridePresent: row.paymentServicePayerOverride !== null,
      setting: "paymentServicePayer",
    },
    {
      default: row.paymentMethodsPolicyDefault,
      effective:
        row.paymentMethodsPolicyOverride ?? row.paymentMethodsPolicyDefault,
      override: row.paymentMethodsPolicyOverride,
      overridePresent: row.paymentMethodsPolicyOverride !== null,
      setting: "paymentMethodsPolicy",
    },
    projection("tipsEnabled", row.tipsEnabledDefault, row.tipsEnabledOverride),
    projection(
      "validationEnabled",
      row.validationEnabledDefault,
      row.validationEnabledOverride,
    ),
    projection(
      "releaseRequiresPayment",
      row.releaseRequiresPaymentDefault,
      row.releaseRequiresPaymentOverride,
    ),
  ];
}

export async function loadLocationConfigurationRow(
  transaction: PostgresTransaction,
  locationId: string,
): Promise<LocationConfigurationContext> {
  const result = await transaction.query<
    LocationConfigurationRow & {
      currency: string;
      timezone: string;
      updatedAt: Date;
    }
  >(
    `SELECT ${projectionRowSelection},
            location.currency AS currency,
            location.timezone AS timezone,
            location.updated_at AS "updatedAt"
     FROM organizations AS organization
     INNER JOIN locations AS location
       ON location.organization_id = organization.id
      AND location.id = $1`,
    [locationId],
  );
  const row = result.rows[0];
  if (row === undefined) {
    throw new Error("Location configuration scope is missing.");
  }
  const { currency, timezone, updatedAt } = row;
  return { currency, row, timezone, updatedAt };
}
