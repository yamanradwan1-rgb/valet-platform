import type {
  ManagementCompanyBrandingResponse,
  ManagementLocationBrandingResponse,
} from "@valet/contracts";

import type { PostgresTransaction } from "../../common/database/postgres";
import { ManagementAccessDeniedError } from "./management-authorization";

interface CompanyBrandingRow {
  readonly displayName: string;
  readonly organizationId: string;
  readonly primaryColor: string;
  readonly updatedAt: Date;
}

interface LocationBrandingRow extends CompanyBrandingRow {
  readonly displayNameOverride: string | null;
  readonly locationId: string;
  readonly locationUpdatedAt: Date;
  readonly primaryColorOverride: string | null;
}

export async function companyBrandingProjection(
  transaction: PostgresTransaction,
  organizationId: string,
): Promise<ManagementCompanyBrandingResponse> {
  const result = await transaction.query<CompanyBrandingRow>(
    `SELECT id::text AS "organizationId", name AS "displayName",
            brand_primary_color AS "primaryColor", updated_at AS "updatedAt"
     FROM organizations
     WHERE id = $1 AND status = 'ACTIVE'`,
    [organizationId],
  );
  const row = result.rows[0];
  if (row === undefined) throw new ManagementAccessDeniedError();
  return {
    displayName: row.displayName,
    organizationId: row.organizationId,
    primaryColor: row.primaryColor,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function locationBrandingProjection(
  transaction: PostgresTransaction,
  organizationId: string,
  locationId: string,
): Promise<ManagementLocationBrandingResponse> {
  const result = await transaction.query<LocationBrandingRow>(
    `SELECT organization.id::text AS "organizationId",
            organization.name AS "displayName",
            organization.brand_primary_color AS "primaryColor",
            organization.updated_at AS "updatedAt",
            location.id::text AS "locationId",
            location.updated_at AS "locationUpdatedAt",
            location.brand_display_name_override AS "displayNameOverride",
            location.brand_primary_color_override AS "primaryColorOverride"
     FROM locations AS location
     INNER JOIN organizations AS organization ON organization.id = location.organization_id
     WHERE location.id = $1 AND location.organization_id = $2
       AND location.status = 'ACTIVE' AND organization.status = 'ACTIVE'`,
    [locationId, organizationId],
  );
  const row = result.rows[0];
  if (row === undefined) throw new ManagementAccessDeniedError();
  return {
    displayName: {
      default: row.displayName,
      effective: row.displayNameOverride ?? row.displayName,
      override: row.displayNameOverride,
      overridePresent: row.displayNameOverride !== null,
    },
    locationId: row.locationId,
    organizationId: row.organizationId,
    primaryColor: {
      default: row.primaryColor,
      effective: row.primaryColorOverride ?? row.primaryColor,
      override: row.primaryColorOverride,
      overridePresent: row.primaryColorOverride !== null,
    },
    updatedAt: row.locationUpdatedAt.toISOString(),
  };
}
