import type {
  StaffDirectoryItem,
  StaffDirectoryQuery,
  StaffDirectoryResponse,
  StaffMembershipDetail,
} from "@valet/contracts";
import { Inject, Injectable } from "@nestjs/common";

import type { PostgresPool } from "../../common/database/postgres";
import { inPostgresTransaction } from "../../common/database/postgres-transaction";
import { RUNTIME_POSTGRES_POOL } from "../../common/database/runtime-database.module";
import type { StaffSessionContext } from "../auth/staff-session-context";
import { recordAdminActivityInTransaction } from "../auth/mfa/mfa-assurance-policy";
import { authorizeCompanyAdminManagement } from "./management-authorization";
import {
  decodeStaffDirectoryCursor,
  encodeStaffDirectoryCursor,
} from "./staff-management-cursor";
import {
  loadStaffMembership,
  staffMembershipDetail,
} from "./staff-management-projection";

interface DirectoryRow extends StaffDirectoryItem {
  readonly createdAt: Date;
}

@Injectable()
export class StaffDirectoryService {
  constructor(@Inject(RUNTIME_POSTGRES_POOL) private readonly pool: PostgresPool) {}

  list(
    context: StaffSessionContext,
    organizationId: string,
    query: StaffDirectoryQuery,
  ): Promise<StaffDirectoryResponse> {
    const cursor = decodeStaffDirectoryCursor(organizationId, query.cursor);
    return inPostgresTransaction(this.pool, async (transaction) => {
      await authorizeCompanyAdminManagement(transaction, context, {
        capability: "STAFF_MANAGE_ELIGIBLE",
        organizationId,
      });
      const parameters: unknown[] = [organizationId];
      let keyset = "";
      if (cursor !== null) {
        parameters.push(cursor.createdAt, cursor.membershipId);
        keyset = "AND (membership.created_at, membership.id) > ($2::timestamptz, $3::uuid)";
      }
      parameters.push(query.limit + 1);
      const result = await transaction.query<DirectoryRow>(
        `WITH page AS (
           SELECT membership.id, membership.user_id, membership.role,
                  membership.status, membership.version, membership.created_at
           FROM organization_memberships AS membership
           WHERE membership.organization_id = $1 ${keyset}
           ORDER BY membership.created_at, membership.id
           LIMIT $${parameters.length}
         )
         SELECT page.id::text AS "membershipId",
                page.role::text AS role, page.status::text AS status,
                page.version, page.created_at AS "createdAt",
                jsonb_build_object('email', staff_user.email) AS identity,
                (SELECT count(*)::integer
                 FROM membership_location_access AS access
                 WHERE access.membership_id = page.id) AS "locationAccessCount"
         FROM page
         INNER JOIN users AS staff_user ON staff_user.id = page.user_id
         ORDER BY page.created_at, page.id`,
        parameters,
      );
      const hasNext = result.rows.length > query.limit;
      const rows = result.rows.slice(0, query.limit);
      const last = rows.at(-1);
      await recordAdminActivityInTransaction(transaction, context);
      return {
        items: rows.map((row) => ({
          identity: row.identity,
          locationAccessCount: row.locationAccessCount,
          membershipId: row.membershipId,
          role: row.role,
          status: row.status,
          version: row.version,
        })),
        nextCursor:
          hasNext && last !== undefined
            ? encodeStaffDirectoryCursor(organizationId, {
                createdAt: last.createdAt.toISOString(),
                membershipId: last.membershipId,
              })
            : null,
      };
    });
  }

  detail(
    context: StaffSessionContext,
    organizationId: string,
    membershipId: string,
  ): Promise<StaffMembershipDetail> {
    return inPostgresTransaction(this.pool, async (transaction) => {
      await authorizeCompanyAdminManagement(transaction, context, {
        capability: "STAFF_MANAGE_ELIGIBLE",
        organizationId,
      });
      const membership = await loadStaffMembership(
        transaction,
        organizationId,
        membershipId,
      );
      const detail = await staffMembershipDetail(transaction, membership);
      await recordAdminActivityInTransaction(transaction, context);
      return detail;
    });
  }
}
