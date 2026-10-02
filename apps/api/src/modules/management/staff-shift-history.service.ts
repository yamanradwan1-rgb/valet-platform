import { Inject, Injectable } from "@nestjs/common";
import type {
  StaffShiftEmployee,
  StaffShiftEmployeeQuery,
  StaffShiftEmployeePage,
  StaffShiftHistoryEntry,
  StaffShiftHistoryQuery,
  StaffShiftHistoryResponse,
} from "@valet/contracts";
import type {
  PostgresPool,
  PostgresTransaction,
} from "../../common/database/postgres";
import { inPostgresTransaction } from "../../common/database/postgres-transaction";
import { RUNTIME_POSTGRES_POOL } from "../../common/database/runtime-database.module";
import type { StaffSessionContext } from "../auth/staff-session-context";
import { recordAdminActivityInTransaction } from "../auth/mfa/mfa-assurance-policy";
import { ManagementAccessDeniedError } from "./management-authorization";
import {
  authorizeStaffManagement,
  requireAuthorizedLocationFilter,
  type StaffManagementAuthority,
} from "./staff-management-authorization";
import {
  decodeHistoryCursor,
  encodeHistoryCursor,
  historyFilterFingerprint,
  historyFingerprint,
  type HistoryCursorIdentity,
} from "./staff-shift-history-cursor";
import {
  staffShiftHistorySql,
  shiftHistoryEntry,
  type StaffShiftHistoryRow,
} from "./staff-shift-history-query";
import { staffShiftEmployeeSql } from "./staff-shift-employee-query";

@Injectable()
export class StaffShiftHistoryService {
  constructor(
    @Inject(RUNTIME_POSTGRES_POOL) private readonly pool: PostgresPool,
  ) {}

  list(
    context: StaffSessionContext,
    organizationId: string,
    query: StaffShiftHistoryQuery,
  ): Promise<StaffShiftHistoryResponse> {
    return this.read(
      context,
      organizationId,
      query.locationId,
      async (transaction, authority) => {
        const identity: HistoryCursorIdentity = {
          organizationId: authority.organizationId,
          scopeFingerprint: authority.scopeFingerprint,
          domain: "shift-history",
          fingerprint: historyFilterFingerprint(query),
        };
        const sql = staffShiftHistorySql(
          authority,
          query,
          decodeHistoryCursor(identity, query.cursor),
        );
        const result = await transaction.query<StaffShiftHistoryRow>(
          sql.text,
          sql.values,
        );
        const page = result.rows.slice(0, query.limit);
        const last = page.at(-1);
        return {
          items: page.map(shiftHistoryEntry),
          nextCursor:
            result.rows.length > query.limit && last
              ? encodeHistoryCursor(identity, {
                  id: last.shiftId,
                  startedAt: last.startedAt.toISOString(),
                })
              : null,
        };
      },
    );
  }

  detail(
    context: StaffSessionContext,
    organizationId: string,
    shiftId: string,
  ): Promise<StaffShiftHistoryEntry> {
    return this.read(
      context,
      organizationId,
      undefined,
      async (transaction, authority) => {
        const sql = staffShiftHistorySql(
          authority,
          { limit: 1 },
          null,
          shiftId,
        );
        const result = await transaction.query<StaffShiftHistoryRow>(
          sql.text,
          sql.values,
        );
        if (!result.rows[0]) throw new ManagementAccessDeniedError();
        return shiftHistoryEntry(result.rows[0]);
      },
    );
  }

  employees(
    context: StaffSessionContext,
    organizationId: string,
    query: StaffShiftEmployeeQuery,
  ): Promise<StaffShiftEmployeePage> {
    return this.read(
      context,
      organizationId,
      query.locationId,
      async (transaction, authority) => {
        const identity: HistoryCursorIdentity = {
          organizationId: authority.organizationId,
          scopeFingerprint: authority.scopeFingerprint,
          domain: "shift-employees",
          fingerprint: historyFingerprint([
            query.locationId ?? null,
            query.search ?? null,
          ]),
        };
        const sql = staffShiftEmployeeSql(
          authority,
          query,
          decodeHistoryCursor(identity, query.cursor),
        );
        const result = await transaction.query<StaffShiftEmployee>(
          sql.text,
          sql.values,
        );
        const page = result.rows.slice(0, query.limit);
        const last = page.at(-1);
        return {
          items: page,
          nextCursor:
            result.rows.length > query.limit && last
              ? encodeHistoryCursor(identity, { id: last.membershipId })
              : null,
        };
      },
    );
  }

  private read<T>(
    context: StaffSessionContext,
    organizationId: string,
    locationId: string | undefined,
    action: (
      transaction: PostgresTransaction,
      authority: StaffManagementAuthority,
    ) => Promise<T>,
  ): Promise<T> {
    return inPostgresTransaction(this.pool, async (transaction) => {
      // Reuse actor proof only. Target management coverage is NOT history authority.
      const authority = await authorizeStaffManagement(transaction, context, {
        organizationId,
        assurance: "STANDARD",
      });
      requireAuthorizedLocationFilter(authority, locationId);
      if (locationId && authority.kind === "COMPANY_ADMIN") {
        const location = await transaction.query(
          "SELECT 1 FROM locations WHERE id=$1 AND organization_id=$2",
          [locationId, authority.organizationId],
        );
        if (location.rowCount !== 1) throw new ManagementAccessDeniedError();
      }
      const result = await action(transaction, authority);
      if (authority.kind === "COMPANY_ADMIN")
        await recordAdminActivityInTransaction(transaction, context);
      return result;
    });
  }
}
