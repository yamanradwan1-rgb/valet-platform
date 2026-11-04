import type {
  ManagementContextResponse,
  ManagementListQuery,
  ManagementLocation,
  ManagementLocationsResponse,
  ManagementOrganization,
  ManagementOrganizationsResponse,
  ManagementScope,
} from "@valet/contracts";
import { Inject, Injectable } from "@nestjs/common";

import type {
  PostgresPool,
  PostgresTransaction,
} from "../../common/database/postgres";
import { inPostgresTransaction } from "../../common/database/postgres-transaction";
import { RUNTIME_POSTGRES_POOL } from "../../common/database/runtime-database.module";
import type { StaffSessionContext } from "../auth/staff-session-context";
import {
  recordAdminActivityInTransaction,
  requireMfaAssuranceInTransaction,
} from "../auth/mfa/mfa-assurance-policy";
import { companyAdminManagementCapabilities } from "./management-capabilities";
import {
  authorizeCompanyAdminManagement,
  hasEligibleCompanyAdminMembership,
  ManagementAccessDeniedError,
} from "./management-authorization";
import {
  decodeManagementCursor,
  encodeManagementCursor,
} from "./management-cursor";

type OrganizationRow = ManagementOrganization;

type LocationRow = ManagementLocation;

async function organizationProjection(
  transaction: PostgresTransaction,
  organizationId: string,
): Promise<ManagementOrganization> {
  const result = await transaction.query<ManagementOrganization>(
    `SELECT id::text AS "organizationId", name, timezone
     FROM organizations WHERE id = $1 AND status = 'ACTIVE'`,
    [organizationId],
  );
  const row = result.rows[0];
  if (result.rowCount !== 1 || row === undefined)
    throw new ManagementAccessDeniedError();
  return row;
}

async function locationProjection(
  transaction: PostgresTransaction,
  organizationId: string,
  locationId: string,
): Promise<ManagementLocation> {
  const result = await transaction.query<LocationRow>(
    `SELECT id::text AS "locationId", name, code, status::text AS status,
            timezone, currency
     FROM locations WHERE id = $1 AND organization_id = $2`,
    [locationId, organizationId],
  );
  const row = result.rows[0];
  if (result.rowCount !== 1 || row === undefined)
    throw new ManagementAccessDeniedError();
  return row;
}

@Injectable()
export class ManagementContextService {
  constructor(
    @Inject(RUNTIME_POSTGRES_POOL) private readonly pool: PostgresPool,
  ) {}

  listOrganizations(
    context: StaffSessionContext,
    query: ManagementListQuery,
  ): Promise<ManagementOrganizationsResponse> {
    const cursor = decodeManagementCursor("organizations", query.cursor, null);
    return inPostgresTransaction(this.pool, async (transaction) => {
      if (
        !(await hasEligibleCompanyAdminMembership(transaction, context.userId))
      ) {
        return { items: [], nextCursor: null };
      }
      await requireMfaAssuranceInTransaction(transaction, context);
      const parameters: unknown[] = [context.userId];
      let keyset = "";
      if (cursor !== null) {
        parameters.push(cursor.sortKey, cursor.id);
        keyset = `AND (organization.name, organization.id) > ($2, $3::uuid)`;
      }
      parameters.push(query.limit + 1);
      const result = await transaction.query<OrganizationRow>(
        `SELECT organization.id::text AS "organizationId", organization.name,
                organization.timezone
         FROM organization_memberships AS membership
         INNER JOIN organizations AS organization
           ON organization.id = membership.organization_id
         WHERE membership.user_id = $1
           AND membership.status = 'ACTIVE'
           AND membership.role = 'ORG_ADMIN'
           AND organization.status = 'ACTIVE'
           ${keyset}
         ORDER BY organization.name, organization.id
         LIMIT $${parameters.length}
         FOR UPDATE OF membership, organization`,
        parameters,
      );
      const hasNext = result.rows.length > query.limit;
      const rows = result.rows.slice(0, query.limit);
      const last = rows.at(-1);
      await recordAdminActivityInTransaction(transaction, context);
      return {
        items: rows,

        nextCursor:
          hasNext && last !== undefined
            ? encodeManagementCursor("organizations", {
                id: last.organizationId,
                organizationId: null,
                sortKey: last.name,
              })
            : null,
      };
    });
  }

  listLocations(
    context: StaffSessionContext,
    organizationId: string,
    query: ManagementListQuery,
  ): Promise<ManagementLocationsResponse> {
    const cursor = decodeManagementCursor(
      "locations",
      query.cursor,
      organizationId,
    );
    return inPostgresTransaction(this.pool, async (transaction) => {
      await authorizeCompanyAdminManagement(transaction, context, {
        capability: "ALL_LOCATIONS_SCOPE_SELECT",
        organizationId,
      });
      const parameters: unknown[] = [organizationId];
      let keyset = "";
      if (cursor !== null) {
        parameters.push(cursor.sortKey, cursor.id);
        keyset = `AND (location.name, location.id) > ($2, $3::uuid)`;
      }
      parameters.push(query.limit + 1);
      const result = await transaction.query<LocationRow>(
        `SELECT location.id::text AS "locationId", location.name, location.code,
                location.status::text AS status, location.timezone, location.currency
         FROM locations AS location
         WHERE location.organization_id = $1 ${keyset}
         ORDER BY location.name, location.id LIMIT $${parameters.length}`,
        parameters,
      );
      const hasNext = result.rows.length > query.limit;
      const rows = result.rows.slice(0, query.limit);
      const last = rows.at(-1);
      await recordAdminActivityInTransaction(transaction, context);
      return {
        items: rows,
        nextCursor:
          hasNext && last !== undefined
            ? encodeManagementCursor("locations", {
                id: last.locationId,
                organizationId,
                sortKey: last.name,
              })
            : null,
      };
    });
  }

  context(
    context: StaffSessionContext,
    organizationId: string,
    scope: ManagementScope,
  ): Promise<ManagementContextResponse> {
    return inPostgresTransaction(this.pool, async (transaction) => {
      await authorizeCompanyAdminManagement(transaction, context, {
        capability: "COMPANY_DASHBOARD_READ",
        organizationId,
        ...(scope.kind === "LOCATION"
          ? { targetLocationId: scope.locationId }
          : {}),
      });
      const organization = await organizationProjection(
        transaction,
        organizationId,
      );
      const selectedLocation =
        scope.kind === "LOCATION"
          ? await locationProjection(
              transaction,
              organizationId,
              scope.locationId,
            )
          : null;
      await recordAdminActivityInTransaction(transaction, context);
      return {
        capabilities: [...companyAdminManagementCapabilities],
        organization,
        scope,
        selectedLocation,
      };
    });
  }
}
