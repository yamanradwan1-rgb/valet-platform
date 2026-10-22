import type {
  GuestContactCompanyValues,
  GuestContactLocationValues,
  ManagementGuestContactCompanyResponse,
  ManagementGuestContactLocationResponse,
} from "@valet/contracts";

import type { PostgresTransaction } from "../../common/database/postgres";
import { ManagementAccessDeniedError } from "./management-authorization";
import { mapManagementSettingsDatabaseError } from "./management-settings-errors";

type Mode = "INHERIT" | "OVERRIDE" | "UNAVAILABLE";
type ContactField = "displayName" | "phone" | "supportUrl" | "hours";

interface CompanyRow {
  readonly revision: number | null;
  readonly updatedAt: Date | null;
  readonly displayName: string | null;
  readonly phone: string | null;
  readonly supportUrl: string | null;
  readonly hours: string | null;
  readonly hoursConfirmed: boolean | null;
}

interface LocationRow extends CompanyRow {
  readonly displayNameMode: Mode | null;
  readonly phoneMode: Mode | null;
  readonly supportUrlMode: Mode | null;
  readonly hoursMode: Mode | null;
  readonly defaultDisplayName: string | null;
  readonly defaultPhone: string | null;
  readonly defaultSupportUrl: string | null;
  readonly defaultHours: string | null;
  readonly defaultHoursConfirmed: boolean | null;
}

const companyValues = (row: CompanyRow): GuestContactCompanyValues => ({
  displayName: row.displayName, phone: row.phone,
  supportUrl: row.supportUrl, hours: row.hours,
  hoursConfirmed: row.hoursConfirmed ?? false,
});

export async function readGuestCompanyContact(
  transaction: PostgresTransaction,
  organizationId: string,
): Promise<ManagementGuestContactCompanyResponse> {
  const result = await transaction.query<CompanyRow>(
    `SELECT contact.revision, contact.updated_at AS "updatedAt",
            contact.display_name AS "displayName",contact.phone,
            contact.support_url AS "supportUrl",contact.hours,
            contact.hours_confirmed AS "hoursConfirmed"
     FROM organizations AS organization
     LEFT JOIN guest_contact_company_defaults AS contact ON contact.organization_id=organization.id
     WHERE organization.id=$1 AND organization.status='ACTIVE'`,
    [organizationId]);
  const row = result.rows[0];
  if (!row) throw new ManagementAccessDeniedError();
  return {
    organizationId, revision: row.revision ?? 0,
    updatedAt: row.updatedAt?.toISOString() ?? null,
    values: companyValues(row),
  };
}

function locationField(row: LocationRow, field: ContactField) {
  const capital = field[0]!.toUpperCase() + field.slice(1);
  const mode = (row[`${field}Mode` as keyof LocationRow] as Mode | null) ?? "INHERIT";
  const value = row[field] as string | null;
  const companyValue = row[`default${capital}` as keyof LocationRow] as string | null;
  const localHoursUsable = row.hoursConfirmed === true;
  const companyHoursUsable = row.defaultHoursConfirmed === true;
  const effectiveValue = mode === "UNAVAILABLE" ? null
    : mode === "OVERRIDE" ? (field === "hours" && !localHoursUsable ? null : value)
      : (field === "hours" && !companyHoursUsable ? null : companyValue);
  if (mode === "OVERRIDE" && value === null) {
    throw new Error("Configured Guest Contact override is missing its value.");
  }
  const configured: GuestContactLocationValues["displayName"] = mode === "OVERRIDE"
    ? { mode: "OVERRIDE", value: value! }
    : mode === "UNAVAILABLE"
      ? { mode: "UNAVAILABLE", value: null }
      : { mode: "INHERIT", value: null };
  return {
    configured,
    effective: { source: mode === "INHERIT" ? "COMPANY" as const
      : mode === "OVERRIDE" ? "LOCATION" as const : "UNAVAILABLE" as const,
      value: effectiveValue },
  };
}

export async function readGuestLocationContact(
  transaction: PostgresTransaction,
  organizationId: string,
  locationId: string,
): Promise<ManagementGuestContactLocationResponse> {
  const result = await transaction.query<LocationRow>(
    `SELECT overrides.revision,overrides.updated_at AS "updatedAt",
            overrides.display_name_mode::text AS "displayNameMode",
            overrides.display_name AS "displayName",
            overrides.phone_mode::text AS "phoneMode",overrides.phone,
            overrides.support_url_mode::text AS "supportUrlMode",
            overrides.support_url AS "supportUrl",
            overrides.hours_mode::text AS "hoursMode",overrides.hours,
            overrides.hours_confirmed AS "hoursConfirmed",
            defaults.display_name AS "defaultDisplayName",
            defaults.phone AS "defaultPhone",defaults.support_url AS "defaultSupportUrl",
            defaults.hours AS "defaultHours",
            defaults.hours_confirmed AS "defaultHoursConfirmed"
     FROM locations AS location
     LEFT JOIN guest_contact_location_overrides AS overrides
       ON overrides.organization_id=location.organization_id AND overrides.location_id=location.id
     LEFT JOIN guest_contact_company_defaults AS defaults
       ON defaults.organization_id=location.organization_id
     WHERE location.organization_id=$1 AND location.id=$2`,
    [organizationId, locationId]);
  const row = result.rows[0];
  if (!row) throw new ManagementAccessDeniedError();
  const displayName = locationField(row, "displayName");
  const phone = locationField(row, "phone");
  const supportUrl = locationField(row, "supportUrl");
  const hours = locationField(row, "hours");
  const values: GuestContactLocationValues = {
    displayName: displayName.configured, phone: phone.configured,
    supportUrl: supportUrl.configured, hours: hours.configured,
    hoursConfirmed: row.hoursConfirmed ?? false,
  };
  return {
    organizationId, locationId, revision: row.revision ?? 0,
    updatedAt: row.updatedAt?.toISOString() ?? null,
    values,
    effective: { displayName: displayName.effective, phone: phone.effective,
      supportUrl: supportUrl.effective, hours: hours.effective },
  };
}

async function mutation(transaction: PostgresTransaction, sql: string, params: unknown[]) {
  try {
    const result = await transaction.query<{ readonly revision: number }>(sql, params);
    if (result.rowCount !== 1 || typeof result.rows[0]?.revision !== "number") {
      throw new Error("Guest Contact command returned no revision.");
    }
  } catch (error) {
    mapManagementSettingsDatabaseError(error);
  }
}

export function saveGuestCompanyContact(
  transaction: PostgresTransaction,
  actorMembershipId: string,
  organizationId: string,
  values: GuestContactCompanyValues,
  expectedRevision: number,
) {
  return mutation(transaction,
    `SELECT guest_information_set_company_contact(
       $1::uuid,$2::uuid,$3::text,$4::text,$5::text,$6::text,$7::boolean,$8::integer
     ) AS revision`,
    [actorMembershipId, organizationId,values.displayName,values.phone,values.supportUrl,
      values.hours,values.hoursConfirmed,expectedRevision]);
}

export function saveGuestLocationContact(
  transaction: PostgresTransaction,
  actorMembershipId: string,
  organizationId: string,
  locationId: string,
  values: GuestContactLocationValues,
  expectedRevision: number,
) {
  return mutation(transaction,
    `SELECT guest_information_set_location_contact(
       $1::uuid,$2::uuid,$3::uuid,$4::guest_contact_field_mode,$5::text,
       $6::guest_contact_field_mode,$7::text,$8::guest_contact_field_mode,$9::text,
       $10::guest_contact_field_mode,$11::text,$12::boolean,$13::integer
     ) AS revision`,
    [actorMembershipId,organizationId,locationId,
      values.displayName.mode,values.displayName.value,
      values.phone.mode,values.phone.value,values.supportUrl.mode,values.supportUrl.value,
      values.hours.mode,values.hours.value,values.hoursConfirmed,expectedRevision]);
}
