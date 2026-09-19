import type {
  ManagementVisitContactNameCorrectionRequest,
  ManagementVisitContactPhoneCorrectionRequest,
  ManagementVisitContactSearchQuery,
  ManagementVisitContactSearchResponse,
  ManagementVisitHistoryQuery,
  ManagementVisitHistoryResponse,
} from "@valet/contracts";
import { Inject, Injectable } from "@nestjs/common";

import type { PostgresPool, PostgresTransaction } from "../../common/database/postgres";
import { inPostgresTransaction } from "../../common/database/postgres-transaction";
import { RUNTIME_POSTGRES_POOL } from "../../common/database/runtime-database.module";
import { ApiTransportValidationError } from "../../common/http/api-errors";
import { recordAdminActivityInTransaction } from "../auth/mfa/mfa-assurance-policy";
import type { StaffSessionContext } from "../auth/staff-session-context";
import {
  authorizeVisitContactCorrection,
  authorizeVisitContactRead,
  type VisitContactViewer,
} from "./management-visit-contact-authorization";
import {
  correctVisitContactName,
  correctVisitContactPhone,
} from "./management-visit-contact-correction";
import {
  decodeVisitContactSearchCursor,
  decodeVisitHistoryCursor,
  encodeVisitContactSearchCursor,
  encodeVisitHistoryCursor,
  type VisitContactSearchMode,
  type VisitHistorySubject,
} from "./management-visit-contact-cursor";
import { queryVisitHistory } from "./management-visit-contact-history-query";
import { captureManagementPaginationSnapshot } from "./management-pagination-snapshot";
import {
  escapeLikePrefix,
  normalizeVisitContactDisplayName,
  normalizeVisitContactName,
  normalizeVisitContactPhone,
  normalizeVisitContactPlate,
  projectVisitContactPhone,
} from "./management-visit-contact-policy";
import {
  queryVisitCustomers,
  queryVisitVehicle,
  type VisitCustomerSearchRow,
} from "./management-visit-contact-search-query";

function searchMode(query: ManagementVisitContactSearchQuery): VisitContactSearchMode {
  if (query.phone !== undefined) return "PHONE";
  if (query.plate !== undefined) return "PLATE";
  if (query.name !== undefined) return "NAME";
  throw new ApiTransportValidationError();
}

function snapshot(
  cursor: { readonly snapshot: string; readonly snapshotCreatedAt: string } | null,
  current: { readonly now: Date; readonly snapshot: string },
) {
  if (cursor === null) return { createdAt: current.now, snapshot: current.snapshot };
  const createdAt = new Date(cursor.snapshotCreatedAt);
  if (createdAt.getTime() > current.now.getTime()) throw new ApiTransportValidationError();
  return { createdAt, snapshot: cursor.snapshot };
}

function latest(row: VisitCustomerSearchRow) {
  return row.latestValetSessionId === null || row.latestCreatedAt === null ||
    row.latestLocationId === null || row.latestLocationName === null ? null : {
      createdAt: row.latestCreatedAt.toISOString(), locationId: row.latestLocationId,
      locationName: row.latestLocationName, valetSessionId: row.latestValetSessionId,
    };
}

function customerProjection(row: VisitCustomerSearchRow, viewer: VisitContactViewer) {
  return {
    associatedVehicles: row.associatedVehicles as Array<{
      vehicleId: string; plateCountry: string | null; plateNumberRaw: string | null;
    }>,
    completedVisitCount: Number(row.completedVisitCount), customerId: row.customerId,
    customerUpdatedAt: row.customerUpdatedAt.toISOString(), displayName: row.displayName,
    kind: "CUSTOMER" as const, latestVisit: latest(row),
    phone: projectVisitContactPhone(row.phoneNormalized, viewer),
  };
}

@Injectable()
export class ManagementVisitContactService {
  constructor(@Inject(RUNTIME_POSTGRES_POOL) private readonly pool: PostgresPool) {}

  search(context: StaffSessionContext, organizationId: string,
    query: ManagementVisitContactSearchQuery): Promise<ManagementVisitContactSearchResponse> {
    return inPostgresTransaction(this.pool, async (transaction) => {
      const viewer = await authorizeVisitContactRead(transaction, context, organizationId);
      const mode = searchMode(query);
      const result = mode === "PLATE"
        ? await this.plateSearch(transaction, viewer, query)
        : await this.customerSearch(transaction, viewer, query, mode);
      if (viewer.role === "ORG_ADMIN") await recordAdminActivityInTransaction(transaction, context);
      return result;
    });
  }

  history(context: StaffSessionContext, organizationId: string, subject: VisitHistorySubject,
    subjectId: string, query: ManagementVisitHistoryQuery): Promise<ManagementVisitHistoryResponse> {
    return inPostgresTransaction(this.pool, async (transaction) => {
      const viewer = await authorizeVisitContactRead(transaction, context, organizationId);
      const expected = { membershipId: viewer.membershipId, organizationId, subject, subjectId };
      const cursor = decodeVisitHistoryCursor(query.cursor, expected);
      const snap = snapshot(cursor, await captureManagementPaginationSnapshot(transaction));
      const rows = await queryVisitHistory(transaction, {
        boundary: cursor === null ? null : { createdAt: new Date(cursor.boundaryCreatedAt), id: cursor.boundaryId },
        limit: query.limit, snapshot: snap.snapshot, snapshotCreatedAt: snap.createdAt,
        subject, subjectId, viewer,
      });
      const hasNext = rows.length > query.limit;
      const page = rows.slice(0, query.limit);
      const items = page.map((row) => ({
        completedAt: row.completedAt?.toISOString() ?? null, createdAt: row.createdAt.toISOString(),
        customerId: row.customerId, displayName: row.displayName, locationId: row.locationId,
        locationName: row.locationName,
        phone: row.phoneNormalized === null ? null : projectVisitContactPhone(row.phoneNormalized, viewer),
        plateCountry: row.plateCountry, plateNumberRaw: row.plateNumberRaw,
        returningContact: row.returningContact, state: row.state as never,
        valetSessionId: row.valetSessionId, vehicleId: row.vehicleId,
      }));
      const last = page.at(-1);
      if (viewer.role === "ORG_ADMIN") await recordAdminActivityInTransaction(transaction, context);
      return { items, nextCursor: hasNext && last !== undefined
        ? encodeVisitHistoryCursor({ ...expected, boundaryCreatedAt: last.createdAt.toISOString(),
            boundaryId: last.valetSessionId, snapshot: snap.snapshot,
            snapshotCreatedAt: snap.createdAt.toISOString() }) : null };
    });
  }

  correctName(context: StaffSessionContext, organizationId: string, customerId: string,
    request: ManagementVisitContactNameCorrectionRequest) {
    return this.correction(context, organizationId, customerId, new Date(request.expectedUpdatedAt),
      (transaction, actor) => correctVisitContactName(transaction, { actorMembershipId: actor.membershipId,
        customerId, displayName: normalizeVisitContactDisplayName(request.displayName),
        expectedUpdatedAt: new Date(request.expectedUpdatedAt), organizationId }));
  }

  correctPhone(context: StaffSessionContext, organizationId: string, customerId: string,
    request: ManagementVisitContactPhoneCorrectionRequest) {
    return this.correction(context, organizationId, customerId, new Date(request.expectedUpdatedAt),
      (transaction, actor) => correctVisitContactPhone(transaction, { actorMembershipId: actor.membershipId,
        customerId, expectedUpdatedAt: new Date(request.expectedUpdatedAt), organizationId,
        phoneNormalized: normalizeVisitContactPhone(request.phone) }));
  }

  private async customerSearch(transaction: PostgresTransaction, viewer: VisitContactViewer,
    query: ManagementVisitContactSearchQuery, mode: "NAME" | "PHONE") {
    const normalized = mode === "PHONE" ? normalizeVisitContactPhone(query.phone!)
      : normalizeVisitContactName(query.name!);
    const expected = { membershipId: viewer.membershipId, mode, normalizedSearch: normalized,
      organizationId: viewer.organizationId };
    const cursor = decodeVisitContactSearchCursor(query.cursor, expected);
    const snap = snapshot(cursor, await captureManagementPaginationSnapshot(transaction));
    const rows = await queryVisitCustomers(transaction, { boundaryId: cursor?.boundaryId ?? null,
      limit: query.limit, mode, search: mode === "NAME" ? escapeLikePrefix(normalized) : normalized,
      snapshot: snap.snapshot, snapshotCreatedAt: snap.createdAt, viewer });
    const hasNext = rows.length > query.limit;
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    return { items: page.map((row) => customerProjection(row, viewer)), mode,
      matchState: page.length === 0 ? "NONE" as const
        : cursor !== null || hasNext || page.length > 1 ? "AMBIGUOUS" as const : "UNIQUE" as const,
      nextCursor: hasNext && last !== undefined ? encodeVisitContactSearchCursor({ ...expected,
        boundaryId: last.customerId, snapshot: snap.snapshot,
        snapshotCreatedAt: snap.createdAt.toISOString() }) : null };
  }

  private async plateSearch(transaction: PostgresTransaction, viewer: VisitContactViewer,
    query: ManagementVisitContactSearchQuery) {
    if (query.cursor !== undefined) throw new ApiTransportValidationError();
    const normalized = normalizeVisitContactPlate({ plate: query.plate!, plateCountry: query.plateCountry! });
    const row = await queryVisitVehicle(transaction, { ...normalized, viewer });
    if (row === null) return { items: [], matchState: "NONE" as const, mode: "PLATE" as const, nextCursor: null };
    const latestVisit = row.latestValetSessionId === null || row.latestCreatedAt === null ||
      row.latestLocationId === null || row.latestLocationName === null ? null : {
        createdAt: row.latestCreatedAt.toISOString(), locationId: row.latestLocationId,
        locationName: row.latestLocationName, valetSessionId: row.latestValetSessionId };
    return { items: [{ completedVisitCount: Number(row.completedVisitCount), kind: "VEHICLE" as const,
      latestVisit, plateCountry: row.plateCountry, plateNumberRaw: row.plateNumberRaw,
      vehicleId: row.vehicleId, vehicleUpdatedAt: row.vehicleUpdatedAt.toISOString() }],
      matchState: "UNIQUE" as const, mode: "PLATE" as const, nextCursor: null };
  }

  private correction(context: StaffSessionContext, organizationId: string, customerId: string,
    expectedUpdatedAt: Date, mutate: (transaction: PostgresTransaction,
      actor: Awaited<ReturnType<typeof authorizeVisitContactCorrection>>) => Promise<{ changed: boolean; updatedAt: Date }>) {
    if (Number.isNaN(expectedUpdatedAt.getTime())) throw new ApiTransportValidationError();
    return inPostgresTransaction(this.pool, async (transaction) => {
      const actor = await authorizeVisitContactCorrection(transaction, context, organizationId);
      const result = await mutate(transaction, actor);
      await recordAdminActivityInTransaction(transaction, context);
      return { changed: result.changed, customerId, updatedAt: result.updatedAt.toISOString() };
    });
  }
}
