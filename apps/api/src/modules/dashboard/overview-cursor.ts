import { ApiTransportValidationError } from "../../common/http/api-errors";

export type OverviewCursorDomain =
  | "active-shifts"
  | "incidents"
  | "keys"
  | "retrieval-queue"
  | "sessions"
  | "tasks";

export interface OverviewCursor {
  readonly sortKey: string;
  readonly tiebreakerId: string;
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function encode(
  domain: OverviewCursorDomain,
  cursor: OverviewCursor,
): string {
  return Buffer.from(
    JSON.stringify({ v: 1, d: domain, a: cursor.sortKey, b: cursor.tiebreakerId }),
    "utf8",
  ).toString("base64url");
}

export function createOverviewCursorCodec(domain: OverviewCursorDomain): {
  decode: (value?: string) => OverviewCursor | null;
  encode: (cursor: OverviewCursor) => string;
} {
  return {
    decode: (value?: string): OverviewCursor | null => {
      if (value === undefined) return null;
      let decoded: unknown;
      try {
        decoded = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
      } catch {
        throw new ApiTransportValidationError();
      }
      if (typeof decoded !== "object" || decoded === null) {
        throw new ApiTransportValidationError();
      }
      const candidate = decoded as Record<string, unknown>;
      if (
        Object.keys(candidate).length !== 4 ||
        candidate.v !== 1 ||
        candidate.d !== domain ||
        typeof candidate.a !== "string" ||
        candidate.a.length < 1 ||
        candidate.a.length > 64 ||
        typeof candidate.b !== "string" ||
        !uuidPattern.test(candidate.b)
      ) {
        throw new ApiTransportValidationError();
      }
      return { sortKey: candidate.a, tiebreakerId: candidate.b };
    },
    encode: (cursor: OverviewCursor) => encode(domain, cursor),
  };
}
