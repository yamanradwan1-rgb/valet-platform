import type {
  ManagementListQuery,
  ManagementLocation,
  ManagementLocationsResponse,
  ManagementOrganization,
  ManagementOrganizationsResponse,
} from "@valet/contracts";
import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";

import type { PostgresPool } from "../../common/database/postgres";
import { inPostgresTransaction } from "../../common/database/postgres-transaction";
import { RUNTIME_POSTGRES_POOL } from "../../common/database/runtime-database.module";
import type { StaffSessionContext } from "../auth/staff-session-context";
import { lockAndRecheckStaffSessionContext } from "../auth/staff-session-revalidation";
import { DashboardOverviewError } from "./dashboard-overview-error";
import {
  decodeDashboardScopeCursor,
  encodeDashboardScopeCursor,
} from "./dashboard-scope-discovery-cursor";

interface MembershipRow {
  readonly membershipId: string;
}

@Injectable()
export class DashboardScopeDiscoveryService {
  constructor(
    @Inject(RUNTIME_POSTGRES_POOL) private readonly pool: PostgresPool,
  ) {}

  listOrganizations(
    context: StaffSessionContext,
    query: ManagementListQuery,
  ): Promise<ManagementOrganizationsResponse> {
    const cursor = decodeDashboardScopeCursor(
      "organizations",
      query.cursor,
      context.userId,
      null,
    );
    return inPostgresTransaction(this.pool, async (transaction) => {
      if ((await lockAndRecheckStaffSessionContext(transaction, context)) === undefined) {
        throw new UnauthorizedException();
      }
      const result = await transaction.query<ManagementOrganization>(
        `SELECT organization.id::text AS "organizationId",
                organization.name, organization.timezone
         FROM organization_memberships AS membership
         INNER JOIN users AS actor
           ON actor.id = membership.user_id AND actor.status = 'ACTIVE'
         INNER JOIN organizations AS organization
           ON organization.id = membership.organization_id
          AND organization.status = 'ACTIVE'
         WHERE actor.id = $1
           AND membership.status = 'ACTIVE'
           AND membership.role = 'LOCATION_MANAGER'
           AND ($2::uuid IS NULL OR organization.id > $2::uuid)
         ORDER BY organization.id
         LIMIT $3`,
        [context.userId, cursor?.id ?? null, query.limit + 1],
      );
      const hasNext = result.rows.length > query.limit;
      const items = result.rows.slice(0, query.limit);
      const last = items.at(-1);
      return {
        items,
        nextCursor:
          hasNext && last !== undefined
            ? encodeDashboardScopeCursor("organizations", context.userId, null, {
                id: last.organizationId,
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
    const cursor = decodeDashboardScopeCursor(
      "locations",
      query.cursor,
      context.userId,
      organizationId,
    );
    return inPostgresTransaction(this.pool, async (transaction) => {
      if ((await lockAndRecheckStaffSessionContext(transaction, context)) === undefined) {
        throw new UnauthorizedException();
      }
      const membership = await transaction.query<MembershipRow>(
        `SELECT membership.id::text AS "membershipId"
         FROM organization_memberships AS membership
         INNER JOIN users AS actor
           ON actor.id = membership.user_id AND actor.status = 'ACTIVE'
         INNER JOIN organizations AS organization
           ON organization.id = membership.organization_id
          AND organization.status = 'ACTIVE'
         WHERE actor.id = $1
           AND membership.organization_id = $2
           AND membership.status = 'ACTIVE'
           AND membership.role = 'LOCATION_MANAGER'`,
        [context.userId, organizationId],
      );
      const membershipId = membership.rows[0]?.membershipId;
      if (membership.rowCount !== 1 || membershipId === undefined) {
        throw new DashboardOverviewError("AUTHORIZATION_DENIED");
      }
      const result = await transaction.query<ManagementLocation>(
        `SELECT location.id::text AS "locationId", location.name, location.code,
                location.status::text AS status, location.timezone, location.currency
         FROM organization_memberships AS membership
         INNER JOIN users AS actor
           ON actor.id = membership.user_id AND actor.status = 'ACTIVE'
         INNER JOIN organizations AS organization
           ON organization.id = membership.organization_id
          AND organization.status = 'ACTIVE'
         INNER JOIN membership_location_access AS access
           ON access.organization_id = organization.id
          AND access.membership_id = membership.id
         INNER JOIN locations AS location
           ON location.organization_id = access.organization_id
          AND location.id = access.location_id
         WHERE membership.id = $1
           AND actor.id = $2
           AND membership.organization_id = $3
           AND membership.status = 'ACTIVE'
           AND membership.role = 'LOCATION_MANAGER'
           AND ($4::uuid IS NULL OR location.id > $4::uuid)
         ORDER BY location.id
         LIMIT $5`,
        [
          membershipId,
          context.userId,
          organizationId,
          cursor?.id ?? null,
          query.limit + 1,
        ],
      );
      const hasNext = result.rows.length > query.limit;
      const items = result.rows.slice(0, query.limit);
      const last = items.at(-1);
      return {
        items,
        nextCursor:
          hasNext && last !== undefined
            ? encodeDashboardScopeCursor(
                "locations",
                context.userId,
                organizationId,
                { id: last.locationId },
              )
            : null,
      };
    });
  }
}
