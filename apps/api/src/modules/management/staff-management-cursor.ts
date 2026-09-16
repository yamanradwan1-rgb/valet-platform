import { ApiTransportValidationError } from "../../common/http/api-errors";

export interface StaffDirectoryCursor {
  readonly createdAt: string;
  readonly membershipId: string;
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function encodeStaffDirectoryCursor(
  organizationId: string,
  cursor: StaffDirectoryCursor,
): string {
  return Buffer.from(
    JSON.stringify({
      c: cursor.createdAt,
      i: cursor.membershipId,
      k: "staff",
      o: organizationId,
      v: 1,
    }),
    "utf8",
  ).toString("base64url");
}

export function decodeStaffDirectoryCursor(
  organizationId: string,
  value: string | undefined,
): StaffDirectoryCursor | null {
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
      candidate.k !== "staff" ||
      candidate.o !== organizationId ||
      typeof candidate.i !== "string" ||
      !uuidPattern.test(candidate.i) ||
      typeof candidate.c !== "string" ||
      !Number.isFinite(Date.parse(candidate.c))
    ) {
      throw new Error();
    }
    return { createdAt: candidate.c, membershipId: candidate.i };
  } catch {
    throw new ApiTransportValidationError();
  }
}
