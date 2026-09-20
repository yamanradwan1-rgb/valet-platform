import { ApiTransportValidationError } from "../../common/http/api-errors";
import {
  decodeSignedManagementCursor,
  encodeSignedManagementCursor,
} from "../management/management-pagination-snapshot";

export type DashboardScopeCursorKind = "locations" | "organizations";

export interface DashboardScopeCursorBoundary {
  readonly id: string;
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const cursorKeys = ["i", "k", "o", "u", "v"];

function token(kind: DashboardScopeCursorKind): string {
  return kind === "organizations" ? "LM_ORGANIZATIONS" : "LM_LOCATIONS";
}

export function encodeDashboardScopeCursor(
  kind: DashboardScopeCursorKind,
  userId: string,
  organizationId: string | null,
  boundary: DashboardScopeCursorBoundary,
): string {
  if (!uuidPattern.test(userId) || !uuidPattern.test(boundary.id)) {
    throw new ApiTransportValidationError();
  }
  if (organizationId !== null && !uuidPattern.test(organizationId)) {
    throw new ApiTransportValidationError();
  }
  return encodeSignedManagementCursor({
    i: boundary.id,
    k: token(kind),
    o: organizationId,
    u: userId,
    v: 1,
  });
}

export function decodeDashboardScopeCursor(
  kind: DashboardScopeCursorKind,
  value: string | undefined,
  userId: string,
  organizationId: string | null,
): DashboardScopeCursorBoundary | null {
  if (value === undefined) return null;
  try {
    const decoded = decodeSignedManagementCursor(value);
    if (typeof decoded !== "object" || decoded === null) throw new Error();
    const candidate = decoded as Record<string, unknown>;
    if (
      Object.keys(candidate).sort().join("|") !== cursorKeys.join("|") ||
      candidate.v !== 1 ||
      candidate.k !== token(kind) ||
      candidate.u !== userId ||
      candidate.o !== organizationId ||
      typeof candidate.i !== "string" ||
      !uuidPattern.test(candidate.i)
    ) {
      throw new Error();
    }
    return { id: candidate.i };
  } catch {
    throw new ApiTransportValidationError();
  }
}
