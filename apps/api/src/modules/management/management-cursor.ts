import { ApiTransportValidationError } from "../../common/http/api-errors";

type CursorKind = "locations" | "organizations";
export interface ManagementCursor {
  readonly id: string;
  readonly organizationId: string | null;
  readonly sortKey: string;
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function encodeManagementCursor(
  kind: CursorKind,
  cursor: ManagementCursor,
): string {
  return Buffer.from(
    JSON.stringify({
      v: 1,
      k: kind,
      o: cursor.organizationId,
      s: cursor.sortKey,
      i: cursor.id,
    }),
    "utf8",
  ).toString("base64url");
}

export function decodeManagementCursor(
  kind: CursorKind,
  value: string | undefined,
  organizationId: string | null,
): ManagementCursor | null {
  if (value === undefined) return null;
  try {
    const decoded: unknown = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    );
    if (typeof decoded !== "object" || decoded === null) throw new Error();
    const candidate = decoded as Record<string, unknown>;
    if (
      Object.keys(candidate).length !== 5 ||
      candidate.v !== 1 ||
      candidate.k !== kind ||
      candidate.o !== organizationId ||
      typeof candidate.s !== "string" ||
      candidate.s.length < 1 ||
      candidate.s.length > 200 ||
      typeof candidate.i !== "string" ||
      !uuidPattern.test(candidate.i)
    )
      throw new Error();
    return { id: candidate.i, organizationId, sortKey: candidate.s };
  } catch {
    throw new ApiTransportValidationError();
  }
}
