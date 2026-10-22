import type { PostgresTransaction } from "../../common/database/postgres";

type ContactMode = "INHERIT" | "OVERRIDE" | "UNAVAILABLE";
type ContactField = "displayName" | "phone" | "supportUrl" | "hours";

interface PublishedInformationRow {
  readonly privacyText: string | null;
  readonly privacyUrl: string | null;
  readonly publishedVersion: number | null;
  readonly publishedAt: Date | null;
  readonly companyDisplayName: string | null;
  readonly companyPhone: string | null;
  readonly companySupportUrl: string | null;
  readonly companyHours: string | null;
  readonly companyHoursConfirmed: boolean | null;
  readonly locationDisplayNameMode: ContactMode | null;
  readonly locationDisplayName: string | null;
  readonly locationPhoneMode: ContactMode | null;
  readonly locationPhone: string | null;
  readonly locationSupportUrlMode: ContactMode | null;
  readonly locationSupportUrl: string | null;
  readonly locationHoursMode: ContactMode | null;
  readonly locationHours: string | null;
  readonly locationHoursConfirmed: boolean | null;
}

export interface GuestInformationPublicProjection {
  readonly locale: "en" | "ar";
  readonly privacy: {
    readonly status: "PUBLISHED" | "UNAVAILABLE";
    readonly text: string | null;
    readonly url: string | null;
    readonly version: number | null;
    readonly publishedAt: string | null;
  };
  readonly contact: {
    readonly displayName: string | null;
    readonly phone: string | null;
    readonly supportUrl: string | null;
    readonly hours: string | null;
  };
}

export class GuestInformationScopeUnavailableError extends Error {
  readonly code = "GUEST_ACCESS_INVALID";

  constructor() {
    super("Guest access is invalid.");
    this.name = "GuestInformationScopeUnavailableError";
  }
}

function effectiveContact(row: PublishedInformationRow, field: ContactField): string | null {
  const name = field[0]!.toUpperCase() + field.slice(1);
  const mode = row[`location${name}Mode` as keyof PublishedInformationRow] as ContactMode | null;
  const company = row[`company${name}` as keyof PublishedInformationRow] as string | null;
  const location = row[`location${name}` as keyof PublishedInformationRow] as string | null;
  if (mode === "UNAVAILABLE") return null;
  const value = mode === "OVERRIDE" ? location : company;
  if (field === "hours") {
    const confirmed = mode === "OVERRIDE"
      ? row.locationHoursConfirmed === true
      : row.companyHoursConfirmed === true;
    if (!confirmed) return null;
  }
  return value || null;
}

/** Call only after the caller authorizes a persisted, current Location context. */
export async function readGuestInformationProjection(
  transaction: PostgresTransaction,
  input: { readonly organizationId: string; readonly locationId: string; readonly locale: "en" | "ar" },
): Promise<GuestInformationPublicProjection> {
  // Each command first locks the active Organization FOR UPDATE inside the
  // DB-owned authorize_actor function. A read FOR SHARE on that same row
  // serializes publication, contact and deactivation against this projection.
  // Separate statements ensure the final projection uses a fresh snapshot.
  const org = await transaction.query(
    `SELECT id FROM organizations WHERE id=$1 AND status='ACTIVE' FOR SHARE`,
    [input.organizationId]);
  if (org.rowCount !== 1) throw new GuestInformationScopeUnavailableError();
  const loc = await transaction.query(
    `SELECT id FROM locations
     WHERE organization_id=$1 AND id=$2 AND status='ACTIVE' FOR SHARE`,
    [input.organizationId, input.locationId]);
  if (loc.rowCount !== 1) throw new GuestInformationScopeUnavailableError();
  const result = await transaction.query<PublishedInformationRow>(
    `SELECT publication.${input.locale === "ar" ? "ar_text" : "en_text"} AS "privacyText",
            publication.${input.locale === "ar" ? "ar_url" : "en_url"} AS "privacyUrl",
            publication.version AS "publishedVersion",
            publication.published_at AS "publishedAt",
            defaults.display_name AS "companyDisplayName",
            defaults.phone AS "companyPhone",
            defaults.support_url AS "companySupportUrl",
            defaults.hours AS "companyHours",
            defaults.hours_confirmed AS "companyHoursConfirmed",
            overrides.display_name_mode::text AS "locationDisplayNameMode",
            overrides.display_name AS "locationDisplayName",
            overrides.phone_mode::text AS "locationPhoneMode",
            overrides.phone AS "locationPhone",
            overrides.support_url_mode::text AS "locationSupportUrlMode",
            overrides.support_url AS "locationSupportUrl",
            overrides.hours_mode::text AS "locationHoursMode",
            overrides.hours AS "locationHours",
            overrides.hours_confirmed AS "locationHoursConfirmed"
     FROM locations AS location
     JOIN organizations AS organization ON organization.id = location.organization_id
     LEFT JOIN guest_location_privacy AS privacy
       ON privacy.organization_id = location.organization_id AND privacy.location_id = location.id
     LEFT JOIN guest_privacy_publications AS publication
       ON publication.organization_id = privacy.organization_id
      AND publication.location_id = privacy.location_id
      AND publication.version = privacy.published_version
     LEFT JOIN guest_contact_company_defaults AS defaults
       ON defaults.organization_id = location.organization_id
     LEFT JOIN guest_contact_location_overrides AS overrides
       ON overrides.organization_id = location.organization_id
      AND overrides.location_id = location.id
     WHERE location.organization_id = $1 AND location.id = $2
       AND location.status = 'ACTIVE' AND organization.status = 'ACTIVE'`,
    [input.organizationId, input.locationId],
  );
  const row = result.rows[0];
  if (result.rowCount !== 1 || row === undefined) {
    throw new GuestInformationScopeUnavailableError();
  }
  const contact = {
    displayName: effectiveContact(row, "displayName"),
    phone: effectiveContact(row, "phone"),
    supportUrl: effectiveContact(row, "supportUrl"),
    hours: effectiveContact(row, "hours"),
  };
  return {
    locale: input.locale,
    privacy: row.publishedVersion !== null && row.publishedAt !== null &&
      (row.privacyText?.trim() || row.privacyUrl?.trim())
      ? {
          status: "PUBLISHED",
          text: row.privacyText,
          url: row.privacyUrl,
          version: row.publishedVersion,
          publishedAt: row.publishedAt.toISOString(),
        }
      : { status: "UNAVAILABLE", text: null, url: null, version: null, publishedAt: null },
    contact,
  };
}
