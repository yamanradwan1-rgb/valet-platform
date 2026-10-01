import type {
  StaffLocationAccessPage,
  StaffLocationAccessQuery,
  StaffLocationCandidatePage,
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
} from "./staff-management-authorization";
import {
  decodeStaffLocationCandidateCursor,
  decodeStaffLocationAccessCursor,
  encodeStaffLocationCandidateCursor,
  encodeStaffLocationAccessCursor,
} from "./staff-location-access-cursor";

interface LocationRow {
  readonly code: string;
  readonly locationId: string;
  readonly name: string;
  readonly status: "ACTIVE" | "INACTIVE";
}

interface CandidateRow extends LocationRow {
  readonly granted: boolean;
}

@Injectable()
export class StaffLocationAccessService {
  constructor(
    @Inject(RUNTIME_POSTGRES_POOL) private readonly pool: PostgresPool,
  ) {}

  page(
    context: StaffSessionContext,
    organizationId: string,
    membershipId: string,
    query: StaffLocationAccessQuery,
  ): Promise<StaffLocationAccessPage> {
    return inPostgresTransaction(this.pool, async (transaction) => {
      const authority = await authorizeStaffManagement(transaction, context, {
        organizationId,
      });
      await authorizeStaffTarget(
        transaction,
        authority,
        membershipId,
        false,
        true,
      );
      const cursor = decodeStaffLocationAccessCursor(
        organizationId,
        membershipId,
        authority,
        query.cursor,
      );
      const result = await transaction.query<LocationRow>(
        `SELECT location.id::text AS "locationId", location.name, location.code,
                location.status::text AS status
         FROM membership_location_access AS access
         INNER JOIN locations AS location
           ON location.id = access.location_id
          AND location.organization_id = access.organization_id
         WHERE access.organization_id = $1
           AND access.membership_id = $2
           AND ($3::uuid IS NULL OR location.id > $3::uuid)
         ORDER BY location.id
         LIMIT $4`,
        [
          organizationId,
          membershipId,
          cursor?.locationId ?? null,
          query.limit + 1,
        ],
      );
      const hasNext = result.rows.length > query.limit;
      const items = result.rows.slice(0, query.limit);
      const last = items.at(-1);
      if (authority.kind === "COMPANY_ADMIN") {
        await recordAdminActivityInTransaction(transaction, context);
      }
      return {
        items,
        nextCursor:
          hasNext && last !== undefined
            ? encodeStaffLocationAccessCursor(
                organizationId,
                membershipId,
                authority,
                { locationId: last.locationId },
              )
            : null,
      };
    });
  }

  candidates(
    context: StaffSessionContext,
    organizationId: string,
    membershipId: string,
    query: StaffLocationAccessQuery,
  ): Promise<StaffLocationCandidatePage> {
    return inPostgresTransaction(this.pool, async (transaction) => {
      const authority = await authorizeStaffManagement(transaction, context, {
        organizationId,
      });
      await authorizeStaffTarget(transaction, authority, membershipId);
      const cursor = decodeStaffLocationCandidateCursor(
        organizationId,
        membershipId,
        authority,
        query.cursor,
      );
      const parameters: unknown[] = [organizationId, membershipId];
      let actorScope = "";
      if (authority.kind === "LOCATION_MANAGER") {
        parameters.push(authority.membershipId);
        actorScope = `AND EXISTS (
          SELECT 1 FROM membership_location_access AS actor_access
          WHERE actor_access.organization_id=location.organization_id
            AND actor_access.membership_id=$3::uuid
            AND actor_access.location_id=location.id
        ) AND location.status='ACTIVE'`;
      }
      const cursorOffset = parameters.length + 1;
      parameters.push(cursor?.locationId ?? null, query.limit + 1);
      const result = await transaction.query<CandidateRow>(
        `SELECT location.id::text AS "locationId", location.name, location.code,
                location.status::text AS status,
                EXISTS (
                  SELECT 1 FROM membership_location_access AS target_access
                  WHERE target_access.organization_id=location.organization_id
                    AND target_access.membership_id=$2
                    AND target_access.location_id=location.id
                ) AS granted
         FROM locations AS location
         WHERE location.organization_id=$1 ${actorScope}
           AND ($${cursorOffset}::uuid IS NULL OR location.id > $${cursorOffset}::uuid)
         ORDER BY location.id
         LIMIT $${cursorOffset + 1}`,
        parameters,
      );
      const hasNext = result.rows.length > query.limit;
      const items = result.rows.slice(0, query.limit);
      const last = items.at(-1);
      if (authority.kind === "COMPANY_ADMIN") {
        await recordAdminActivityInTransaction(transaction, context);
      }
      return {
        items,
        nextCursor:
          hasNext && last !== undefined
            ? encodeStaffLocationCandidateCursor(
                organizationId,
                membershipId,
                authority,
                { locationId: last.locationId },
              )
            : null,
      };
    });
  }
}
