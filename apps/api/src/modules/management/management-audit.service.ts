import type {
  ManagementAuditLocationQuery,
  ManagementAuditOrganizationQuery,
  ManagementAuditResponse,
} from "@valet/contracts";
import { managementAuditKnownEventTypes } from "@valet/contracts";
import { Inject, Injectable } from "@nestjs/common";

import type {
  PostgresPool,
  PostgresTransaction,
} from "../../common/database/postgres";
import { inPostgresTransaction } from "../../common/database/postgres-transaction";
import { RUNTIME_POSTGRES_POOL } from "../../common/database/runtime-database.module";
import { ApiTransportValidationError } from "../../common/http/api-errors";
import { recordAdminActivityInTransaction } from "../auth/mfa/mfa-assurance-policy";
import type { StaffSessionContext } from "../auth/staff-session-context";
import { ManagementAccessDeniedError } from "./management-authorization";
import {
  authorizeManagementAuditLocation,
  authorizeManagementAuditOrganization,
  type ManagementAuditAuthorization,
} from "./management-audit-authorization";
import {
  decodeManagementAuditCursor,
  encodeManagementAuditCursor,
  type ManagementAuditCursorBoundary,
  type ManagementAuditCursorScope,
} from "./management-audit-cursor";
import {
  managementAuditSupervisorEventTypes,
  projectManagementAuditEvent,
} from "./management-audit-projection";
import {
  queryManagementAuditPage,
} from "./management-audit-query";
import {
  captureManagementPaginationSnapshot,
} from "./management-pagination-snapshot";

const knownEventTypes = new Set<string>(managementAuditKnownEventTypes);

function normalizedEventType(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const normalized = value.trim().toUpperCase();
  if (!knownEventTypes.has(normalized)) throw new ApiTransportValidationError();
  return normalized;
}

function snapshotForRequest(
  cursor: ManagementAuditCursorBoundary | null,
  current: { readonly now: Date; readonly snapshot: string },
): { readonly createdAt: Date; readonly snapshot: string } {
  if (cursor === null) return { createdAt: current.now, snapshot: current.snapshot };
  const createdAt = new Date(cursor.snapshotCreatedAt);
  if (createdAt.getTime() > current.now.getTime()) {
    throw new ApiTransportValidationError();
  }
  return { createdAt, snapshot: cursor.snapshot };
}

@Injectable()
export class ManagementAuditService {
  constructor(
    @Inject(RUNTIME_POSTGRES_POOL) private readonly pool: PostgresPool,
  ) {}

  listOrganization(
    context: StaffSessionContext,
    organizationId: string,
    query: ManagementAuditOrganizationQuery,
  ): Promise<ManagementAuditResponse> {
    const scope: ManagementAuditCursorScope = {
      eventType: normalizedEventType(query.eventType),
      locationId: null,
      organizationId,
      organizationLocationFilter: query.locationId ?? null,
      routeKind: "ORG",
    };
    const cursor = decodeManagementAuditCursor(query.cursor, scope);
    return inPostgresTransaction(this.pool, async (transaction) => {
      const viewer = await authorizeManagementAuditOrganization(
        transaction,
        context,
        organizationId,
      );
      if (scope.organizationLocationFilter !== null) {
        const filtered = await authorizeManagementAuditLocation(
          transaction,
          context,
          organizationId,
          scope.organizationLocationFilter,
        );
        if (filtered.role !== "ORG_ADMIN")
          throw new ManagementAccessDeniedError();
      }
      return this.page(
        transaction,
        context,
        viewer,
        scope,
        cursor,
        query.limit,
      );
    });
  }

  listLocation(
    context: StaffSessionContext,
    organizationId: string,
    locationId: string,
    query: ManagementAuditLocationQuery,
  ): Promise<ManagementAuditResponse> {
    const scope: ManagementAuditCursorScope = {
      eventType: normalizedEventType(query.eventType),
      locationId,
      organizationId,
      organizationLocationFilter: null,
      routeKind: "LOCATION",
    };
    const cursor = decodeManagementAuditCursor(query.cursor, scope);
    return inPostgresTransaction(this.pool, async (transaction) => {
      const viewer = await authorizeManagementAuditLocation(
        transaction,
        context,
        organizationId,
        locationId,
      );
      return this.page(
        transaction,
        context,
        viewer,
        scope,
        cursor,
        query.limit,
      );
    });
  }

  private async page(
    transaction: PostgresTransaction,
    context: StaffSessionContext,
    viewer: ManagementAuditAuthorization,
    scope: ManagementAuditCursorScope,
    cursor: ManagementAuditCursorBoundary | null,
    limit: number,
  ): Promise<ManagementAuditResponse> {
    const current = await captureManagementPaginationSnapshot(transaction);
    const snapshot = snapshotForRequest(cursor, current);
    const result = await queryManagementAuditPage(transaction, {
      cursor,
      eventType: scope.eventType,
      exactLocationId: scope.locationId,
      limit,
      organizationId: scope.organizationId,
      organizationLocationFilter: scope.organizationLocationFilter,
      snapshot: snapshot.snapshot,
      snapshotCreatedAt: snapshot.createdAt,
      supervisorEventTypes:
        viewer.role === "VALET_SUPERVISOR"
          ? managementAuditSupervisorEventTypes
          : null,
    });
    const hasNext = result.length > limit;
    const page = result.slice(0, limit);
    const last = page.at(-1);
    const items = page.map((row) => projectManagementAuditEvent(row, viewer));
    if (viewer.role === "ORG_ADMIN") {
      await recordAdminActivityInTransaction(transaction, context);
    }
    return {
      items,
      nextCursor:
        hasNext && last !== undefined
          ? encodeManagementAuditCursor(scope, {
              id: last.id,
              occurredAt: last.occurredAt.toISOString(),
              snapshot: snapshot.snapshot,
              snapshotCreatedAt: snapshot.createdAt.toISOString(),
            })
          : null,
    };
  }
}
