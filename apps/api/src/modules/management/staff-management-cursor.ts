import { createHash } from "node:crypto";
import type { StaffDirectoryQuery } from "@valet/contracts";
import { ApiTransportValidationError } from "../../common/http/api-errors";

export interface StaffDirectoryCursor {
  readonly createdAt: string;
  readonly membershipId: string;
}

export interface StaffDirectoryAuthorityCursorScope {
  readonly scopeFingerprint: string;
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function staffDirectoryFilterFingerprint(
  query: StaffDirectoryQuery,
): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        query.search?.trim() || null,
        query.role ?? null,
        query.status ?? null,
        query.locationId?.toLowerCase() ?? null,
      ]),
    )
    .digest("hex");
}

export function encodeStaffDirectoryCursor(
  organizationId: string,
  cursor: StaffDirectoryCursor,
  fingerprint: string,
  authority?: StaffDirectoryAuthorityCursorScope,
): string {
  if (authority !== undefined) {
    return Buffer.from(
      JSON.stringify({
        a: "lm",
        c: cursor.createdAt,
        f: fingerprint,
        g: authority.scopeFingerprint,
        i: cursor.membershipId,
        k: "staff",
        o: organizationId,
        v: 3,
      }),
      "utf8",
    ).toString("base64url");
  }
  return Buffer.from(
    JSON.stringify({
      c: cursor.createdAt,
      f: fingerprint,
      i: cursor.membershipId,
      k: "staff",
      o: organizationId,
      v: 2,
    }),
    "utf8",
  ).toString("base64url");
}

export function decodeStaffDirectoryCursor(
  organizationId: string,
  value: string | undefined,
  fingerprint: string,
  authority?: StaffDirectoryAuthorityCursorScope,
): StaffDirectoryCursor | null {
  if (value === undefined) return null;
  try {
    const decoded: unknown = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    );
    if (typeof decoded !== "object" || decoded === null) throw new Error();
    const candidate = decoded as Record<string, unknown>;
    const scoped = authority !== undefined;
    if (
      Object.keys(candidate).length !== (scoped ? 8 : 6) ||
      candidate.v !== (scoped ? 3 : 2) ||
      candidate.f !== fingerprint ||
      candidate.k !== "staff" ||
      candidate.o !== organizationId ||
      (scoped && candidate.a !== "lm") ||
      (scoped && candidate.g !== authority.scopeFingerprint) ||
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
