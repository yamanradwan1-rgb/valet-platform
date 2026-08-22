import type {
  BrandingClearRequest,
  BrandingReadResponse,
  BrandingSetRequest,
} from "@valet/contracts";
import { brandingReadResponseSchema } from "@valet/contracts";

import type { PostgresPool } from "../../common/database/postgres";
import { inPostgresTransaction } from "../../common/database/postgres-transaction";
import { authorizeDashboardLocation } from "./dashboard-location-authorization";
import { assertAuthorized, DashboardOverviewError } from "./dashboard-overview-error";

interface PgError {
  readonly code?: string;
}

function mapBrandingDatabaseError(error: unknown): never {
  const code = (error as PgError).code;
  if (code === "40001") {
    throw new DashboardOverviewError("CONFIGURATION_OVERRIDE_CONFLICT");
  }
  throw error;
}

interface BrandingRow {
  readonly name: string;
  readonly brandPrimaryColor: string;
  readonly brandDisplayNameOverride: string | null;
  readonly brandPrimaryColorOverride: string | null;
  readonly updatedAt: Date;
}

async function loadBrandingRow(
  pool: PostgresPool,
  input: { authenticatedUserId: string; locationId: string },
): Promise<BrandingReadResponse> {
  return inPostgresTransaction(pool, async (transaction) => {
    const scope = await authorizeDashboardLocation(
      transaction,
      input.authenticatedUserId,
      input.locationId,
    );
    assertAuthorized(scope);
    const rows = await transaction.query<BrandingRow>(
      `SELECT organization.name AS "name",
              organization.brand_primary_color AS "brandPrimaryColor",
              location.brand_display_name_override
                AS "brandDisplayNameOverride",
              location.brand_primary_color_override
                AS "brandPrimaryColorOverride",
              location.updated_at AS "updatedAt"
       FROM locations AS location
       INNER JOIN organizations AS organization
         ON organization.id = location.organization_id
       WHERE location.id = $1 AND location.organization_id = $2`,
      [scope.locationId, scope.organizationId],
    );
    const row = rows.rows[0];
    if (row === undefined) {
      throw new Error("Location branding scope is missing.");
    }
    const response: BrandingReadResponse = {
      displayName: {
        default: row.name,
        effective:
          row.brandDisplayNameOverride === null
            ? row.name
            : row.brandDisplayNameOverride,
        override:
          row.brandDisplayNameOverride === null
            ? null
            : row.brandDisplayNameOverride,
        overridePresent: row.brandDisplayNameOverride !== null,
      },
      locationId: input.locationId,
      primaryColor: {
        default: row.brandPrimaryColor,
        effective:
          row.brandPrimaryColorOverride === null
            ? row.brandPrimaryColor
            : row.brandPrimaryColorOverride,
        override:
          row.brandPrimaryColorOverride === null
            ? null
            : row.brandPrimaryColorOverride,
        overridePresent: row.brandPrimaryColorOverride !== null,
      },
      updatedAt: row.updatedAt.toISOString(),
    };
    return brandingReadResponseSchema.parse(response);
  });
}

export async function readLocationBranding(
  pool: PostgresPool,
  input: { authenticatedUserId: string; locationId: string },
): Promise<BrandingReadResponse> {
  return loadBrandingRow(pool, input);
}

export async function setBrandingOverride(
  pool: PostgresPool,
  input: BrandingSetRequest & {
    authenticatedUserId: string;
    locationId: string;
  },
): Promise<BrandingReadResponse> {
  await inPostgresTransaction(pool, async (transaction) => {
    const scope = await authorizeDashboardLocation(
      transaction,
      input.authenticatedUserId,
      input.locationId,
    );
    assertAuthorized(scope);
    try {
      if (input.setting === "brandDisplayName") {
        await transaction.query(
          `SELECT location_branding_set_display_name_override(
              $1::uuid, $2::uuid, $3::text, $4::timestamptz)`,
          [
            scope.membershipId,
            scope.locationId,
            input.value,
            input.expectedUpdatedAt,
          ],
        );
      } else {
        await transaction.query(
          `SELECT location_branding_set_primary_color_override(
              $1::uuid, $2::uuid, $3::text, $4::timestamptz)`,
          [
            scope.membershipId,
            scope.locationId,
            input.value,
            input.expectedUpdatedAt,
          ],
        );
      }
    } catch (error) {
      mapBrandingDatabaseError(error);
    }
  });
  return readLocationBranding(pool, {
    authenticatedUserId: input.authenticatedUserId,
    locationId: input.locationId,
  });
}

export async function clearBrandingOverride(
  pool: PostgresPool,
  input: BrandingClearRequest & {
    authenticatedUserId: string;
    locationId: string;
  },
): Promise<BrandingReadResponse> {
  await inPostgresTransaction(pool, async (transaction) => {
    const scope = await authorizeDashboardLocation(
      transaction,
      input.authenticatedUserId,
      input.locationId,
    );
    assertAuthorized(scope);
    try {
      if (input.setting === "brandDisplayName") {
        await transaction.query(
          `SELECT location_branding_clear_display_name_override(
              $1::uuid, $2::uuid, $3::timestamptz)`,
          [scope.membershipId, scope.locationId, input.expectedUpdatedAt],
        );
      } else {
        await transaction.query(
          `SELECT location_branding_clear_primary_color_override(
              $1::uuid, $2::uuid, $3::timestamptz)`,
          [scope.membershipId, scope.locationId, input.expectedUpdatedAt],
        );
      }
    } catch (error) {
      mapBrandingDatabaseError(error);
    }
  });
  return readLocationBranding(pool, {
    authenticatedUserId: input.authenticatedUserId,
    locationId: input.locationId,
  });
}
