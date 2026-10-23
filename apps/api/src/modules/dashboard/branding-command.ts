import type {
  BrandingClearRequest,
  BrandingReadResponse,
  BrandingSetRequest,
} from "@valet/contracts";
import { brandingReadResponseSchema } from "@valet/contracts";

import type {
  PostgresPool,
  PostgresTransaction,
} from "../../common/database/postgres";
import { inPostgresTransaction } from "../../common/database/postgres-transaction";
import {
  mapDashboardConfigurationDatabaseError,
} from "./dashboard-configuration-errors";
import { authorizeDashboardLocation } from "./dashboard-location-authorization";
import { assertAuthorized } from "./dashboard-overview-error";

function mapBrandingDatabaseError(error: unknown): never {
  mapDashboardConfigurationDatabaseError(error);
}

async function requireAuthorizedScope(
  transaction: PostgresTransaction,
  authenticatedUserId: string,
  locationId: string,
): Promise<{ locationId: string; membershipId: string }> {
  const scope = await authorizeDashboardLocation(
    transaction,
    authenticatedUserId,
    locationId,
    "BASIC_BRANDING",
  );
  assertAuthorized(scope);
  return { locationId: scope.locationId, membershipId: scope.membershipId };
}

async function requireAuthorizedReadScope(
  transaction: PostgresTransaction,
  authenticatedUserId: string,
  locationId: string,
): Promise<void> {
  // The first BASIC_BRANDING check is only a manager eligibility hint. Staff
  // Management grant writers hold the matching EXCLUSIVE organization lock.
  const hint = await authorizeDashboardLocation(
    transaction,
    authenticatedUserId,
    locationId,
    "BASIC_BRANDING",
  );
  assertAuthorized(hint);

  const fence = await transaction.query<{ readonly readCommitted: boolean }>(
    `SELECT pg_advisory_xact_lock_shared(
       hashtextextended('staff-management-org:' || $1::text, 0)
     ), current_setting('transaction_isolation') = 'read committed'
       AS "readCommitted"`,
    [hint.organizationId],
  );
  // A stale REPEATABLE READ snapshot cannot prove post-revocation authority.
  assertAuthorized(fence.rows[0]?.readCommitted === true ? hint : null);

  const current = await authorizeDashboardLocation(
    transaction,
    authenticatedUserId,
    locationId,
    "BASIC_BRANDING",
  );
  // Never switch to Company Admin while holding a SHARED manager lock.
  assertAuthorized(
    current?.organizationId === hint.organizationId &&
      current.membershipId === hint.membershipId
      ? current
      : null,
  );
  // The advisory lock remains held through the Branding row projection until
  // inPostgresTransaction commits or rolls back this read.
}

interface BrandingRow {
  readonly name: string;
  readonly brandPrimaryColor: string;
  readonly brandDisplayNameOverride: string | null;
  readonly brandPrimaryColorOverride: string | null;
  readonly updatedAt: Date;
}

async function loadBrandingRow(
  transaction: PostgresTransaction,
  locationId: string,
): Promise<BrandingReadResponse> {
  const result = await transaction.query<BrandingRow>(
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
     WHERE location.id = $1 AND organization.status = 'ACTIVE'
       AND location.status = 'ACTIVE'`,
    [locationId],
  );
  const row = result.rows[0];
  if (row === undefined) {
    throw new Error("Location branding scope is missing.");
  }
  return brandingReadResponseSchema.parse({
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
    locationId,
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
  });
}

export async function readLocationBranding(
  pool: PostgresPool,
  input: { authenticatedUserId: string; locationId: string },
): Promise<BrandingReadResponse> {
  return inPostgresTransaction(pool, async (transaction) => {
    await requireAuthorizedReadScope(
      transaction,
      input.authenticatedUserId,
      input.locationId,
    );
    return loadBrandingRow(transaction, input.locationId);
  });
}

export async function setBrandingOverride(
  pool: PostgresPool,
  input: BrandingSetRequest & {
    authenticatedUserId: string;
    locationId: string;
  },
): Promise<BrandingReadResponse> {
  return inPostgresTransaction(pool, async (transaction) => {
    const scope = await requireAuthorizedScope(
      transaction,
      input.authenticatedUserId,
      input.locationId,
    );
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
    // Projection is read inside the same transaction as the mutation so the
    // response token/state can never diverge from the committed mutation.
    return loadBrandingRow(transaction, scope.locationId);
  });
}

export async function clearBrandingOverride(
  pool: PostgresPool,
  input: BrandingClearRequest & {
    authenticatedUserId: string;
    locationId: string;
  },
): Promise<BrandingReadResponse> {
  return inPostgresTransaction(pool, async (transaction) => {
    const scope = await requireAuthorizedScope(
      transaction,
      input.authenticatedUserId,
      input.locationId,
    );
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
    // Projection is read inside the same transaction as the mutation.
    return loadBrandingRow(transaction, scope.locationId);
  });
}
