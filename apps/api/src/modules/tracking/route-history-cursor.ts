import { ApiTransportValidationError } from "../../common/http/api-errors";

export interface RouteHistoryCursor {
  readonly capturedAt: Date;
  readonly id: string;
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function decodeRouteHistoryCursor(value?: string): RouteHistoryCursor | null {
  if (value === undefined) return null;
  try {
    const decoded: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (typeof decoded !== "object" || decoded === null) throw new Error();
    const keys = Object.keys(decoded);
    const candidate = decoded as { capturedAt?: unknown; id?: unknown };
    if (
      keys.length !== 2 ||
      !keys.includes("capturedAt") ||
      !keys.includes("id") ||
      typeof candidate.capturedAt !== "string" ||
      typeof candidate.id !== "string" ||
      !uuidPattern.test(candidate.id)
    ) throw new Error();
    const capturedAt = new Date(candidate.capturedAt);
    if (!Number.isFinite(capturedAt.getTime()) || capturedAt.toISOString() !== candidate.capturedAt) {
      throw new Error();
    }
    return { capturedAt, id: candidate.id };
  } catch {
    throw new ApiTransportValidationError();
  }
}

export function encodeRouteHistoryCursor(cursor: RouteHistoryCursor): string {
  return Buffer.from(
    JSON.stringify({ capturedAt: cursor.capturedAt.toISOString(), id: cursor.id }),
    "utf8",
  ).toString("base64url");
}
