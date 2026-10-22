import type { GuestInformationLocale } from "@valet/contracts";

import type { PostgresTransaction } from "../../common/database/postgres";
import type { StaffSessionContext } from "../auth/staff-session-context";
import { authorizeGuestInformationOverview } from "./guest-information-authorization";
import { ManagementAccessDeniedError } from "./management-authorization";
import { ManagementSettingsError } from "./management-settings-errors";

interface OverviewRow {
  readonly id: string;
  readonly name: string;
  readonly enText: string | null;
  readonly enUrl: string | null;
  readonly arText: string | null;
  readonly arUrl: string | null;
  readonly draftEnText: string | null;
  readonly draftEnUrl: string | null;
  readonly draftArText: string | null;
  readonly draftArUrl: string | null;
  readonly publishedVersion: number | null;
  readonly contactDisplayName: string | null;
  readonly contactPhone: string | null;
  readonly contactSupportUrl: string | null;
  readonly contactHours: string | null;
}

function privacyStatus(row: OverviewRow, locale: GuestInformationLocale) {
  const localeAvailable = locale === "ar"
    ? row.arText?.trim() || row.arUrl?.trim()
    : row.enText?.trim() || row.enUrl?.trim();
  if (row.publishedVersion !== null) {
    return localeAvailable ? "PUBLISHED" as const : "UNAVAILABLE" as const;
  }
  return [row.draftEnText, row.draftEnUrl, row.draftArText, row.draftArUrl]
    .some((part) => Boolean(part?.trim())) ? "DRAFT" as const : "NOT_SET" as const;
}

/** Scoped overview; LM never receives global organization counts or hidden rows. */
export async function readGuestInformationOverview(
  transaction: PostgresTransaction,
  context: StaffSessionContext,
  organizationId: string,
  locale: GuestInformationLocale,
) {
  const actor = await authorizeGuestInformationOverview(transaction, context, organizationId);
  const company = await transaction.query<{ readonly name: string }>(
    `SELECT name FROM organizations WHERE id=$1 AND status='ACTIVE'`, [organizationId]);
  if (company.rowCount !== 1 || !company.rows[0]) throw new ManagementAccessDeniedError();
  const result = await transaction.query<OverviewRow>(
    `SELECT location.id::text AS id, location.name,
            publication.en_text AS "enText", publication.en_url AS "enUrl",
            publication.ar_text AS "arText", publication.ar_url AS "arUrl",
            privacy.draft_en_text AS "draftEnText", privacy.draft_en_url AS "draftEnUrl",
            privacy.draft_ar_text AS "draftArText", privacy.draft_ar_url AS "draftArUrl",
            publication.version AS "publishedVersion",
            CASE WHEN overrides.display_name_mode = 'UNAVAILABLE' THEN NULL
                 WHEN overrides.display_name_mode = 'OVERRIDE' THEN overrides.display_name
                 ELSE defaults.display_name END AS "contactDisplayName",
            CASE WHEN overrides.phone_mode = 'UNAVAILABLE' THEN NULL
                 WHEN overrides.phone_mode = 'OVERRIDE' THEN overrides.phone
                 ELSE defaults.phone END AS "contactPhone",
            CASE WHEN overrides.support_url_mode = 'UNAVAILABLE' THEN NULL
                 WHEN overrides.support_url_mode = 'OVERRIDE' THEN overrides.support_url
                 ELSE defaults.support_url END AS "contactSupportUrl",
            CASE WHEN overrides.hours_mode = 'UNAVAILABLE' THEN NULL
                 WHEN overrides.hours_mode = 'OVERRIDE'
                   THEN CASE WHEN overrides.hours_confirmed THEN overrides.hours ELSE NULL END
                 ELSE CASE WHEN defaults.hours_confirmed THEN defaults.hours ELSE NULL END
                 END AS "contactHours"
     FROM locations AS location
     LEFT JOIN guest_location_privacy AS privacy
       ON privacy.organization_id=location.organization_id AND privacy.location_id=location.id
     LEFT JOIN guest_privacy_publications AS publication
       ON publication.organization_id=privacy.organization_id
      AND publication.location_id=privacy.location_id
      AND publication.version=privacy.published_version
     LEFT JOIN guest_contact_company_defaults AS defaults
       ON defaults.organization_id=location.organization_id
     LEFT JOIN guest_contact_location_overrides AS overrides
       ON overrides.organization_id=location.organization_id AND overrides.location_id=location.id
     WHERE location.organization_id=$1 AND location.status='ACTIVE'
       AND ($2::boolean OR EXISTS (
         SELECT 1 FROM membership_location_access AS access
         WHERE access.organization_id=$1 AND access.location_id=location.id
           AND access.membership_id=$3::uuid
       ))
     ORDER BY location.name,location.id LIMIT 501`,
    [organizationId, actor.kind === "COMPANY_ADMIN", actor.membershipId]);
  if (result.rows.length > 500) throw new ManagementSettingsError("CONFIGURATION_VALUE_INVALID");
  if (actor.kind === "LOCATION_MANAGER") {
    const allowed = new Set(actor.activeLocationIds);
    if (result.rows.some((row) => !allowed.has(row.id))) throw new ManagementAccessDeniedError();
  }
  return {
    companyName: company.rows[0].name,
    locations: result.rows.map((row) => ({
      id: row.id, name: row.name, privacy: privacyStatus(row, locale),
      contact: [row.contactDisplayName, row.contactPhone,
        row.contactSupportUrl, row.contactHours].some((value) => Boolean(value))
        ? "AVAILABLE" as const : "NOT_SET" as const,
    })),
    publishedCount: result.rows.filter((row) => row.publishedVersion !== null).length,
  };
}
