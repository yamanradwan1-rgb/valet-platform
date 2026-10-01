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
import {
  authorizeStaffManagement,
  authorizeStaffTarget,
  requireAuthorizedLocationFilter,
} from "./staff-management-authorization";
import {
  decodeStaffDirectoryCursor,
  encodeStaffDirectoryCursor,
  staffDirectoryFilterFingerprint,
} from "./staff-management-cursor";
import { staffDirectorySql } from "./staff-directory-query";
import {
  loadStaffMembership,
  staffMembershipDetail,
} from "./staff-management-projection";

interface DirectoryRow extends StaffDirectoryItem {
  readonly createdAt: Date;
}

@Injectable()
export class StaffDirectoryService {
  constructor(
    @Inject(RUNTIME_POSTGRES_POOL) private readonly pool: PostgresPool,
  ) {}

  list(
    context: StaffSessionContext,
    organizationId: string,
    query: StaffDirectoryQuery,
  ): Promise<StaffDirectoryResponse> {
    const fingerprint = staffDirectoryFilterFingerprint(query);
    return inPostgresTransaction(this.pool, async (transaction) => {
      const authority = await authorizeStaffManagement(transaction, context, {
        organizationId,
      });
      requireAuthorizedLocationFilter(authority, query.locationId);
      const cursorScope =
        authority.kind === "LOCATION_MANAGER"
          ? { scopeFingerprint: authority.scopeFingerprint }
          : undefined;
      const cursor = decodeStaffDirectoryCursor(
        organizationId,
        query.cursor,
        fingerprint,
        cursorScope,
      );
      const sql = staffDirectorySql(
        organizationId,
        query,
        cursor,
        authority.kind === "LOCATION_MANAGER"
          ? authority.membershipId
          : undefined,
      );
      const result = await transaction.query<DirectoryRow>(
        sql.text,
        sql.values,
      );
      const hasNext = result.rows.length > query.limit;
      const rows = result.rows.slice(0, query.limit);
      const last = rows.at(-1);
      if (authority.kind === "COMPANY_ADMIN") {
        await recordAdminActivityInTransaction(transaction, context);
      }
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
            ? encodeStaffDirectoryCursor(
                organizationId,
                {
                  createdAt: last.createdAt.toISOString(),
                  membershipId: last.membershipId,
                },
                fingerprint,
                cursorScope,
              )
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
      const authority = await authorizeStaffManagement(transaction, context, {
        organizationId,
      });
      await authorizeStaffTarget(transaction, authority, membershipId);
      const membership = await loadStaffMembership(
        transaction,
        organizationId,
        membershipId,
      );
      const detail = await staffMembershipDetail(transaction, membership);
      if (authority.kind === "COMPANY_ADMIN") {
        await recordAdminActivityInTransaction(transaction, context);
      }
      return detail;
    });
  }
}
