import type {
  ManagementCompanySettingsResponse,
  ManagementLocationSettingsResponse,
  OperatingHoursValue,
} from "@valet/contracts";

import type { PostgresTransaction } from "../../common/database/postgres";
import { ManagementAccessDeniedError } from "./management-authorization";

interface CompanyRow {
  readonly checkInPhotosRequired: boolean;
  readonly employeeRetrievalRequestedNotificationEnabled: boolean;
  readonly guestVehicleReadyNotificationEnabled: boolean;
  readonly handoffStandardMethodPolicy: "DYNAMIC_QR" | "EITHER" | "PICKUP_CODE";
  readonly languageDefault: "AR" | "EN";
  readonly ocrAssistEnabled: boolean;
  readonly organizationId: string;
  readonly parkingSpotRequired: boolean;
  readonly paymentMethodsPolicy: "CASH_ONLY" | "CASH_OR_DIGITAL" | "DIGITAL_ONLY";
  readonly paymentServicePayer: "CUSTOMER" | "VENUE";
  readonly rawGpsRetentionDays: number;
  readonly releaseRequiresPayment: boolean;
  readonly tipsEnabled: boolean;
  readonly trackingEnabled: boolean;
  readonly updatedAt: Date;
  readonly valetServiceFee: string;
  readonly validationEnabled: boolean;
}

interface LocationRow extends CompanyRow {
  readonly checkInPhotosRequiredOverride: boolean | null;
  readonly currency: string;
  readonly employeeRetrievalRequestedNotificationEnabledOverride: boolean | null;
  readonly guestVehicleReadyNotificationEnabledOverride: boolean | null;
  readonly handoffStandardMethodPolicyOverride: CompanyRow["handoffStandardMethodPolicy"] | null;
  readonly languageDefaultOverride: "AR" | "EN" | null;
  readonly locationId: string;
  readonly locationUpdatedAt: Date;
  readonly ocrAssistEnabledOverride: boolean | null;
  readonly parkingSpotRequiredOverride: boolean | null;
  readonly paymentMethodsPolicyOverride: CompanyRow["paymentMethodsPolicy"] | null;
  readonly paymentServicePayerOverride: CompanyRow["paymentServicePayer"] | null;
  readonly rawGpsRetentionDaysOverride: number | null;
  readonly releaseRequiresPaymentOverride: boolean | null;
  readonly tipsEnabledOverride: boolean | null;
  readonly timezone: string;
  readonly trackingEnabledOverride: boolean | null;
  readonly valetServiceFeeOverride: string | null;
  readonly validationEnabledOverride: boolean | null;
}

interface HoursRow {
  readonly closesAt: string | null;
  readonly isClosed: boolean;
  readonly opensAt: string | null;
  readonly scope: "DEFAULT" | "OVERRIDE";
  readonly weekday: OperatingHoursValue["days"][number]["weekday"];
}

function localMinute(value: string | null): string | null {
  return value === null ? null : value.slice(0, 5);
}

function hours(rows: readonly HoursRow[]): OperatingHoursValue | null {
  if (rows.length === 0) return null;
  if (rows.length !== 7) throw new Error("Corrupted operating-hours configuration.");
  return {
    days: rows.map((row) =>
      row.isClosed
        ? { status: "CLOSED" as const, weekday: row.weekday }
        : {
            closesAt: localMinute(row.closesAt)!,
            opensAt: localMinute(row.opensAt)!,
            status: "OPEN" as const,
            weekday: row.weekday,
          },
    ) as OperatingHoursValue["days"],
  };
}

function inherited<T>(defaultValue: T, override: T | null) {
  return {
    default: defaultValue,
    effective: override ?? defaultValue,
    override,
    overridePresent: override !== null,
  };
}

async function loadHours(
  transaction: PostgresTransaction,
  organizationId: string,
  locationId?: string,
): Promise<{ readonly defaults: OperatingHoursValue | null; readonly override: OperatingHoursValue | null }> {
  const result = await transaction.query<HoursRow>(
    `SELECT scope, weekday, "isClosed", "opensAt", "closesAt"
     FROM (
       SELECT 'DEFAULT'::text AS scope, weekday::text AS weekday,
              is_closed AS "isClosed", opens_at::text AS "opensAt",
              closes_at::text AS "closesAt"
       FROM organization_operating_hours
       WHERE organization_id = $1
       UNION ALL
       SELECT 'OVERRIDE'::text AS scope, weekday::text AS weekday,
              is_closed AS "isClosed", opens_at::text AS "opensAt",
              closes_at::text AS "closesAt"
       FROM location_operating_hours_overrides
       WHERE organization_id = $1 AND location_id = $2::uuid
     ) AS operating_hours
     ORDER BY CASE weekday
       WHEN 'MONDAY' THEN 1 WHEN 'TUESDAY' THEN 2 WHEN 'WEDNESDAY' THEN 3
       WHEN 'THURSDAY' THEN 4 WHEN 'FRIDAY' THEN 5 WHEN 'SATURDAY' THEN 6 ELSE 7 END`,
    [organizationId, locationId ?? null],
  );
  return {
    defaults: hours(result.rows.filter((row) => row.scope === "DEFAULT")),
    override: hours(result.rows.filter((row) => row.scope === "OVERRIDE")),
  };
}

export async function companySettingsProjection(
  transaction: PostgresTransaction,
  organizationId: string,
): Promise<ManagementCompanySettingsResponse> {
  const result = await transaction.query<CompanyRow>(
    `SELECT organization.id::text AS "organizationId",
            organization.updated_at AS "updatedAt",
            organization.check_in_photos_required AS "checkInPhotosRequired",
            organization.handoff_standard_method_policy::text AS "handoffStandardMethodPolicy",
            organization.tracking_enabled AS "trackingEnabled",
            organization.raw_gps_retention_days AS "rawGpsRetentionDays",
            organization.valet_service_fee::text AS "valetServiceFee",
            organization.payment_service_payer::text AS "paymentServicePayer",
            organization.payment_methods_policy::text AS "paymentMethodsPolicy",
            organization.tips_enabled AS "tipsEnabled",
            organization.validation_enabled AS "validationEnabled",
            organization.release_requires_payment AS "releaseRequiresPayment",
            organization.language_default::text AS "languageDefault",
            organization.ocr_assist_enabled AS "ocrAssistEnabled",
            organization.parking_spot_required AS "parkingSpotRequired",
            organization.employee_retrieval_requested_notification_enabled
              AS "employeeRetrievalRequestedNotificationEnabled",
            organization.guest_vehicle_ready_notification_enabled
              AS "guestVehicleReadyNotificationEnabled"
     FROM organizations AS organization
     WHERE organization.id = $1 AND organization.status = 'ACTIVE'`,
    [organizationId],
  );
  const row = result.rows[0];
  if (row === undefined) throw new ManagementAccessDeniedError();
  const operating = await loadHours(transaction, organizationId);
  return {
    defaults: {
      checkInPhotosRequired: row.checkInPhotosRequired,
      employeeRetrievalRequestedNotificationEnabled:
        row.employeeRetrievalRequestedNotificationEnabled,
      guestVehicleReadyNotificationEnabled: row.guestVehicleReadyNotificationEnabled,
      handoffStandardMethodPolicy: row.handoffStandardMethodPolicy,
      languageDefault: row.languageDefault,
      ocrAssistEnabled: row.ocrAssistEnabled,
      operatingHours: operating.defaults,
      parkingSpotRequired: row.parkingSpotRequired,
      paymentMethodsPolicy: row.paymentMethodsPolicy,
      paymentServicePayer: row.paymentServicePayer,
      rawGpsRetentionDays: row.rawGpsRetentionDays,
      releaseRequiresPayment: row.releaseRequiresPayment,
      tipsEnabled: row.tipsEnabled,
      trackingEnabled: row.trackingEnabled,
      valetServiceFee: row.valetServiceFee,
      validationEnabled: row.validationEnabled,
    },
    organizationId: row.organizationId,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function locationSettingsProjection(
  transaction: PostgresTransaction,
  organizationId: string,
  locationId: string,
): Promise<ManagementLocationSettingsResponse> {
  const result = await transaction.query<LocationRow>(
    `SELECT organization.id::text AS "organizationId", organization.updated_at AS "updatedAt",
            location.id::text AS "locationId", location.updated_at AS "locationUpdatedAt",
            location.timezone, location.currency,
            organization.check_in_photos_required AS "checkInPhotosRequired",
            location.check_in_photos_required_override AS "checkInPhotosRequiredOverride",
            organization.handoff_standard_method_policy::text AS "handoffStandardMethodPolicy",
            location.handoff_standard_method_policy_override::text AS "handoffStandardMethodPolicyOverride",
            organization.tracking_enabled AS "trackingEnabled", location.tracking_enabled_override AS "trackingEnabledOverride",
            organization.raw_gps_retention_days AS "rawGpsRetentionDays", location.raw_gps_retention_days_override AS "rawGpsRetentionDaysOverride",
            organization.valet_service_fee::text AS "valetServiceFee", location.valet_service_fee_override::text AS "valetServiceFeeOverride",
            organization.payment_service_payer::text AS "paymentServicePayer", location.payment_service_payer_override::text AS "paymentServicePayerOverride",
            organization.payment_methods_policy::text AS "paymentMethodsPolicy", location.payment_methods_policy_override::text AS "paymentMethodsPolicyOverride",
            organization.tips_enabled AS "tipsEnabled", location.tips_enabled_override AS "tipsEnabledOverride",
            organization.validation_enabled AS "validationEnabled", location.validation_enabled_override AS "validationEnabledOverride",
            organization.release_requires_payment AS "releaseRequiresPayment", location.release_requires_payment_override AS "releaseRequiresPaymentOverride",
            organization.language_default::text AS "languageDefault", location.language_default_override::text AS "languageDefaultOverride",
            organization.ocr_assist_enabled AS "ocrAssistEnabled", location.ocr_assist_enabled_override AS "ocrAssistEnabledOverride",
            organization.parking_spot_required AS "parkingSpotRequired", location.parking_spot_required_override AS "parkingSpotRequiredOverride",
            organization.employee_retrieval_requested_notification_enabled AS "employeeRetrievalRequestedNotificationEnabled",
            location.employee_retrieval_requested_notification_enabled_override AS "employeeRetrievalRequestedNotificationEnabledOverride",
            organization.guest_vehicle_ready_notification_enabled AS "guestVehicleReadyNotificationEnabled",
            location.guest_vehicle_ready_notification_enabled_override AS "guestVehicleReadyNotificationEnabledOverride"
     FROM locations AS location
     INNER JOIN organizations AS organization ON organization.id = location.organization_id
     WHERE location.id = $1 AND location.organization_id = $2
       AND location.status = 'ACTIVE' AND organization.status = 'ACTIVE'`,
    [locationId, organizationId],
  );
  const row = result.rows[0];
  if (row === undefined) throw new ManagementAccessDeniedError();
  const operating = await loadHours(transaction, organizationId, locationId);
  const effectiveHours = operating.override ?? operating.defaults;
  return {
    currency: row.currency,
    locationId: row.locationId,
    organizationId: row.organizationId,
    settings: {
      checkInPhotosRequired: inherited(row.checkInPhotosRequired, row.checkInPhotosRequiredOverride),
      employeeRetrievalRequestedNotificationEnabled: inherited(row.employeeRetrievalRequestedNotificationEnabled, row.employeeRetrievalRequestedNotificationEnabledOverride),
      guestVehicleReadyNotificationEnabled: inherited(row.guestVehicleReadyNotificationEnabled, row.guestVehicleReadyNotificationEnabledOverride),
      handoffStandardMethodPolicy: inherited(row.handoffStandardMethodPolicy, row.handoffStandardMethodPolicyOverride),
      languageDefault: inherited(row.languageDefault, row.languageDefaultOverride),
      ocrAssistEnabled: inherited(row.ocrAssistEnabled, row.ocrAssistEnabledOverride),
      operatingHours: {
        default: operating.defaults,
        effective: effectiveHours,
        override: operating.override,
        overridePresent: operating.override !== null,
      },
      parkingSpotRequired: inherited(row.parkingSpotRequired, row.parkingSpotRequiredOverride),
      paymentMethodsPolicy: inherited(row.paymentMethodsPolicy, row.paymentMethodsPolicyOverride),
      paymentServicePayer: inherited(row.paymentServicePayer, row.paymentServicePayerOverride),
      rawGpsRetentionDays: inherited(row.rawGpsRetentionDays, row.rawGpsRetentionDaysOverride),
      releaseRequiresPayment: inherited(row.releaseRequiresPayment, row.releaseRequiresPaymentOverride),
      tipsEnabled: inherited(row.tipsEnabled, row.tipsEnabledOverride),
      trackingEnabled: inherited(row.trackingEnabled, row.trackingEnabledOverride),
      valetServiceFee: inherited(row.valetServiceFee, row.valetServiceFeeOverride),
      validationEnabled: inherited(row.validationEnabled, row.validationEnabledOverride),
    },
    timezone: row.timezone,
    updatedAt: row.locationUpdatedAt.toISOString(),
  };
}
