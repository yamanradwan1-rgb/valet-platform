import { ApiTransportValidationError } from "../../common/http/api-errors";
import {
  decodeSignedManagementCursor,
  encodeSignedManagementCursor,
  requireManagementSnapshot,
} from "./management-pagination-snapshot";

export type VisitContactSearchMode = "NAME" | "PHONE" | "PLATE";
export type VisitHistorySubject = "CUSTOMER" | "VEHICLE";

interface CursorCommon {
  readonly membershipId: string;
  readonly organizationId: string;
  readonly snapshot: string;
  readonly snapshotCreatedAt: string;
}

export interface VisitContactSearchCursor extends CursorCommon {
  readonly boundaryId: string;
  readonly mode: Exclude<VisitContactSearchMode, "PLATE">;
  readonly normalizedSearch: string;
}

export interface VisitHistoryCursor extends CursorCommon {
  readonly boundaryCreatedAt: string;
  readonly boundaryId: string;
  readonly subject: VisitHistorySubject;
  readonly subjectId: string;
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function timestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toISOString() === value;
}

function decode(value: string): Record<string, unknown> {
  try {
    const parsed = decodeSignedManagementCursor(value);
    if (parsed === null || typeof parsed !== "object") throw new Error();
    return parsed as Record<string, unknown>;
  } catch {
    throw new ApiTransportValidationError();
  }
}

function encode(value: Record<string, unknown>): string {
  return encodeSignedManagementCursor(value);
}

export function encodeVisitContactSearchCursor(value: VisitContactSearchCursor): string {
  return encode({ b: value.boundaryId, m: value.mode, n: value.normalizedSearch,
    o: value.organizationId, p: value.membershipId, q: requireManagementSnapshot(value.snapshot),
    s: value.snapshotCreatedAt, v: 2 });
}

export function decodeVisitContactSearchCursor(
  value: string | undefined,
  expected: Omit<VisitContactSearchCursor, "boundaryId" | "snapshot" | "snapshotCreatedAt">,
): VisitContactSearchCursor | null {
  if (value === undefined) return null;
  const item = decode(value);
  if (Object.keys(item).sort().join("|") !== "b|m|n|o|p|q|s|v" || item.v !== 2 ||
      item.m !== expected.mode || item.n !== expected.normalizedSearch ||
      item.o !== expected.organizationId || item.p !== expected.membershipId ||
      typeof item.b !== "string" || !uuid.test(item.b) || typeof item.q !== "string" ||
      !timestamp(item.s)) {
    throw new ApiTransportValidationError();
  }
  return { boundaryId: item.b, membershipId: expected.membershipId,
    mode: expected.mode, normalizedSearch: expected.normalizedSearch,
    organizationId: expected.organizationId, snapshot: requireManagementSnapshot(item.q),
    snapshotCreatedAt: item.s };
}

export function encodeVisitHistoryCursor(value: VisitHistoryCursor): string {
  return encode({ b: value.boundaryId, c: value.boundaryCreatedAt, k: value.subject,
    o: value.organizationId, p: value.membershipId, q: requireManagementSnapshot(value.snapshot),
    s: value.snapshotCreatedAt, u: value.subjectId, v: 2 });
}

export function decodeVisitHistoryCursor(
  value: string | undefined,
  expected: Omit<VisitHistoryCursor, "boundaryCreatedAt" | "boundaryId" | "snapshot" | "snapshotCreatedAt">,
): VisitHistoryCursor | null {
  if (value === undefined) return null;
  const item = decode(value);
  if (Object.keys(item).sort().join("|") !== "b|c|k|o|p|q|s|u|v" || item.v !== 2 ||
      item.k !== expected.subject || item.o !== expected.organizationId ||
      item.p !== expected.membershipId || item.u !== expected.subjectId ||
      typeof item.b !== "string" || !uuid.test(item.b) || typeof item.q !== "string" ||
      !timestamp(item.c) ||
      !timestamp(item.s)) throw new ApiTransportValidationError();
  return { boundaryCreatedAt: item.c, boundaryId: item.b,
    membershipId: expected.membershipId, organizationId: expected.organizationId,
    snapshot: requireManagementSnapshot(item.q), snapshotCreatedAt: item.s,
    subject: expected.subject, subjectId: expected.subjectId };
}
