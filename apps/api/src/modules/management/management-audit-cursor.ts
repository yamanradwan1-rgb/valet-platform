import { ApiTransportValidationError } from "../../common/http/api-errors";

export type ManagementAuditRouteKind = "LOCATION" | "ORG";

export interface ManagementAuditCursorScope {
  readonly eventType: string | null;
  readonly locationId: string | null;
  readonly organizationId: string;
  readonly organizationLocationFilter: string | null;
  readonly routeKind: ManagementAuditRouteKind;
}

export interface ManagementAuditCursorBoundary {
  readonly id: string;
  readonly occurredAt: string;
  readonly snapshotCreatedAt: string;
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const eventTypePattern = /^[A-Z][A-Z0-9_]{0,99}$/;
const base64UrlPattern = /^[A-Za-z0-9_-]+$/;
const cursorKeys = ["e", "f", "i", "k", "l", "o", "s", "t", "v"];

function isCanonicalIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}

function validateScope(scope: ManagementAuditCursorScope): void {
  if (
    !uuidPattern.test(scope.organizationId) ||
    (scope.eventType !== null && !eventTypePattern.test(scope.eventType)) ||
    (scope.locationId !== null && !uuidPattern.test(scope.locationId)) ||
    (scope.organizationLocationFilter !== null &&
      !uuidPattern.test(scope.organizationLocationFilter)) ||
    (scope.routeKind === "ORG" && scope.locationId !== null) ||
    (scope.routeKind === "LOCATION" &&
      (scope.locationId === null || scope.organizationLocationFilter !== null))
  ) {
    throw new ApiTransportValidationError();
  }
}

export function encodeManagementAuditCursor(
  scope: ManagementAuditCursorScope,
  boundary: ManagementAuditCursorBoundary,
): string {
  validateScope(scope);
  if (
    !uuidPattern.test(boundary.id) ||
    !isCanonicalIsoTimestamp(boundary.occurredAt) ||
    !isCanonicalIsoTimestamp(boundary.snapshotCreatedAt)
  ) {
    throw new ApiTransportValidationError();
  }
  return Buffer.from(
    JSON.stringify({
      e: scope.eventType,
      f: scope.organizationLocationFilter,
      i: boundary.id,
      k: scope.routeKind,
      l: scope.locationId,
      o: scope.organizationId,
      s: boundary.snapshotCreatedAt,
      t: boundary.occurredAt,
      v: 1,
    }),
    "utf8",
  ).toString("base64url");
}

export function decodeManagementAuditCursor(
  value: string | undefined,
  scope: ManagementAuditCursorScope,
): ManagementAuditCursorBoundary | null {
  validateScope(scope);
  if (value === undefined) return null;
  try {
    if (
      value.length < 8 ||
      value.length > 512 ||
      !base64UrlPattern.test(value)
    ) {
      throw new Error();
    }
    const bytes = Buffer.from(value, "base64url");
    if (bytes.toString("base64url") !== value) throw new Error();
    const decoded: unknown = JSON.parse(bytes.toString("utf8"));
    if (typeof decoded !== "object" || decoded === null) throw new Error();
    const candidate = decoded as Record<string, unknown>;
    if (
      Object.keys(candidate).sort().join("|") !== cursorKeys.join("|") ||
      candidate.v !== 1 ||
      candidate.k !== scope.routeKind ||
      candidate.o !== scope.organizationId ||
      candidate.l !== scope.locationId ||
      candidate.e !== scope.eventType ||
      candidate.f !== scope.organizationLocationFilter ||
      typeof candidate.i !== "string" ||
      !uuidPattern.test(candidate.i) ||
      !isCanonicalIsoTimestamp(candidate.t) ||
      !isCanonicalIsoTimestamp(candidate.s)
    ) {
      throw new Error();
    }
    return {
      id: candidate.i,
      occurredAt: candidate.t,
      snapshotCreatedAt: candidate.s,
    };
  } catch {
    throw new ApiTransportValidationError();
  }
}
