import type {
  ManagementGuestPrivacyResponse,
  ManagementGuestPrivacySaveRequest,
} from "@valet/contracts";

import type { PostgresTransaction } from "../../common/database/postgres";
import { ManagementAccessDeniedError } from "./management-authorization";
import { mapManagementSettingsDatabaseError } from "./management-settings-errors";

interface PrivacyRow {
  readonly revision: number | null;
  readonly updatedAt: Date | null;
  readonly publishedVersion: number | null;
  readonly publishedAt: Date | null;
  readonly draftEnText: string | null;
  readonly draftEnUrl: string | null;
  readonly draftArText: string | null;
  readonly draftArUrl: string | null;
  readonly enText: string | null;
  readonly enUrl: string | null;
  readonly arText: string | null;
  readonly arUrl: string | null;
}

const content = (text: string | null, url: string | null) => ({
  text: text ?? "",
  url: url ?? "",
});

export async function readGuestPrivacy(
  transaction: PostgresTransaction,
  organizationId: string,
  locationId: string,
): Promise<ManagementGuestPrivacyResponse> {
  const result = await transaction.query<PrivacyRow>(
    `SELECT privacy.revision, privacy.updated_at AS "updatedAt",
            privacy.published_version AS "publishedVersion",
            publication.published_at AS "publishedAt",
            privacy.draft_en_text AS "draftEnText", privacy.draft_en_url AS "draftEnUrl",
            privacy.draft_ar_text AS "draftArText", privacy.draft_ar_url AS "draftArUrl",
            publication.en_text AS "enText", publication.en_url AS "enUrl",
            publication.ar_text AS "arText", publication.ar_url AS "arUrl"
     FROM locations AS location
     LEFT JOIN guest_location_privacy AS privacy
       ON privacy.organization_id = location.organization_id AND privacy.location_id = location.id
     LEFT JOIN guest_privacy_publications AS publication
       ON publication.organization_id = privacy.organization_id
      AND publication.location_id = privacy.location_id
      AND publication.version = privacy.published_version
     WHERE location.organization_id = $1 AND location.id = $2`,
    [organizationId, locationId],
  );
  const row = result.rows[0];
  if (!row) throw new ManagementAccessDeniedError();
  return {
    organizationId,
    locationId,
    revision: row.revision ?? 0,
    updatedAt: row.updatedAt?.toISOString() ?? null,
    drafts: {
      en: content(row.draftEnText, row.draftEnUrl),
      ar: content(row.draftArText, row.draftArUrl),
    },
    published: row.publishedVersion === null ? null : {
      en: content(row.enText, row.enUrl),
      ar: content(row.arText, row.arUrl),
    },
    publishedVersion: row.publishedVersion,
    publishedAt: row.publishedAt?.toISOString() ?? null,
  };
}

async function mutation(
  transaction: PostgresTransaction,
  sql: string,
  params: unknown[],
): Promise<void> {
  try {
    const result = await transaction.query<{ readonly revision: number }>(sql, params);
    if (result.rowCount !== 1 || typeof result.rows[0]?.revision !== "number") {
      throw new Error("Guest Privacy command returned no revision.");
    }
  } catch (error) {
    mapManagementSettingsDatabaseError(error);
  }
}

export function saveGuestPrivacy(
  transaction: PostgresTransaction,
  actorMembershipId: string,
  organizationId: string,
  locationId: string,
  command: ManagementGuestPrivacySaveRequest,
) {
  return mutation(transaction,
    `SELECT guest_information_save_privacy(
       $1::uuid,$2::uuid,$3::uuid,$4::text,$5::text,$6::text,$7::text,$8::integer
     ) AS revision`,
    [actorMembershipId, organizationId, locationId,
      command.drafts.en.text, command.drafts.en.url,
      command.drafts.ar.text, command.drafts.ar.url, command.expectedRevision]);
}

export function publishGuestPrivacy(
  transaction: PostgresTransaction,
  actorMembershipId: string,
  organizationId: string,
  locationId: string,
  expectedRevision: number,
  publish: boolean,
) {
  return mutation(transaction,
    publish
      ? `SELECT guest_information_publish_privacy($1::uuid,$2::uuid,$3::uuid,$4::integer) AS revision`
      : `SELECT guest_information_unpublish_privacy($1::uuid,$2::uuid,$3::uuid,$4::integer) AS revision`,
    [actorMembershipId, organizationId, locationId, expectedRevision]);
}
