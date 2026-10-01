import { ApiTransportValidationError } from "../../common/http/api-errors";
import type { StaffManagementAuthority } from "./staff-management-authorization";

export interface StaffLocationAccessCursor {
  readonly locationId: string;
}

export type StaffLocationCandidateCursor = StaffLocationAccessCursor;

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function encodeStaffLocationAccessCursor(
  organizationId: string,
  membershipId: string,
  authority: StaffManagementAuthority,
  cursor: StaffLocationAccessCursor,
): string {
  return Buffer.from(
    JSON.stringify({
      a: authority.kind === "COMPANY_ADMIN" ? "ca" : "lm",
      g: authority.scopeFingerprint,
      i: cursor.locationId,
      k: "staff-location-access",
      m: membershipId,
      o: organizationId,
      v: 1,
    }),
    "utf8",
  ).toString("base64url");
}

export function encodeStaffLocationCandidateCursor(
  organizationId: string,
  membershipId: string,
  authority: StaffManagementAuthority,
  cursor: StaffLocationCandidateCursor,
): string {
  return Buffer.from(
    JSON.stringify({
      a: authority.kind === "COMPANY_ADMIN" ? "ca" : "lm",
      g: authority.scopeFingerprint,
      i: cursor.locationId,
      k: "staff-location-candidate",
      m: membershipId,
      o: organizationId,
      v: 1,
    }),
    "utf8",
  ).toString("base64url");
}

export function decodeStaffLocationCandidateCursor(
  organizationId: string,
  membershipId: string,
  authority: StaffManagementAuthority,
  value: string | undefined,
): StaffLocationCandidateCursor | null {
  if (value === undefined) return null;
  try {
    const decoded: unknown = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    );
    if (typeof decoded !== "object" || decoded === null) throw new Error();
    const candidate = decoded as Record<string, unknown>;
    if (
      Object.keys(candidate).length !== 7 ||
      candidate.v !== 1 ||
      candidate.k !== "staff-location-candidate" ||
      candidate.o !== organizationId ||
      candidate.m !== membershipId ||
      candidate.a !== (authority.kind === "COMPANY_ADMIN" ? "ca" : "lm") ||
      candidate.g !== authority.scopeFingerprint ||
      typeof candidate.i !== "string" ||
      !uuidPattern.test(candidate.i)
    ) {
      throw new Error();
    }
    return { locationId: candidate.i };
  } catch {
    throw new ApiTransportValidationError();
  }
}

export function decodeStaffLocationAccessCursor(
  organizationId: string,
  membershipId: string,
  authority: StaffManagementAuthority,
  value: string | undefined,
): StaffLocationAccessCursor | null {
  if (value === undefined) return null;
  try {
    const decoded: unknown = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    );
    if (typeof decoded !== "object" || decoded === null) throw new Error();
    const candidate = decoded as Record<string, unknown>;
    if (
      Object.keys(candidate).length !== 7 ||
      candidate.v !== 1 ||
      candidate.k !== "staff-location-access" ||
      candidate.o !== organizationId ||
      candidate.m !== membershipId ||
      candidate.a !== (authority.kind === "COMPANY_ADMIN" ? "ca" : "lm") ||
      candidate.g !== authority.scopeFingerprint ||
      typeof candidate.i !== "string" ||
      !uuidPattern.test(candidate.i)
    ) {
      throw new Error();
    }
    return { locationId: candidate.i };
  } catch {
    throw new ApiTransportValidationError();
  }
}
