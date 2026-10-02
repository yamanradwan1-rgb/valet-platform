import { createHash } from "node:crypto";
import {
  staffShiftHistoryCursorPayloadSchema,
  type StaffShiftHistoryQuery,
} from "@valet/contracts";
import { ApiTransportValidationError } from "../../common/http/api-errors";

export interface HistoryCursorIdentity {
  readonly organizationId: string;
  readonly scopeFingerprint: string;
  readonly fingerprint: string;
  readonly domain: "shift-history" | "shift-employees";
}
export interface HistoryCursorTuple {
  readonly id: string;
  readonly startedAt?: string;
}

export function historyFilterFingerprint(
  query: StaffShiftHistoryQuery,
): string {
  return historyFingerprint([
    query.membershipId?.toLowerCase() ?? null,
    query.locationId?.toLowerCase() ?? null,
    query.status ?? null,
    query.from ? new Date(query.from).toISOString() : null,
    query.to ? new Date(query.to).toISOString() : null,
  ]);
}
export function historyFingerprint(parts: readonly unknown[]): string {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}
export function encodeHistoryCursor(
  identity: HistoryCursorIdentity,
  tuple: HistoryCursorTuple,
): string {
  return Buffer.from(
    JSON.stringify({ ...identity, ...tuple, v: 1 }),
    "utf8",
  ).toString("base64url");
}
export function decodeHistoryCursor(
  identity: HistoryCursorIdentity,
  value: string | undefined,
): HistoryCursorTuple | null {
  if (value === undefined) return null;
  try {
    if (!/^[A-Za-z0-9_-]{8,512}$/.test(value)) throw new Error();
    const payload = staffShiftHistoryCursorPayloadSchema.parse(
      JSON.parse(Buffer.from(value, "base64url").toString("utf8")),
    );
    if (
      payload.domain !== identity.domain ||
      payload.organizationId !== identity.organizationId ||
      payload.scopeFingerprint !== identity.scopeFingerprint ||
      payload.fingerprint !== identity.fingerprint ||
      (identity.domain === "shift-history"
        ? payload.startedAt === undefined
        : payload.startedAt !== undefined)
    )
      throw new Error();
    return {
      id: payload.id,
      ...(payload.startedAt === undefined
        ? {}
        : { startedAt: payload.startedAt }),
    };
  } catch {
    throw new ApiTransportValidationError();
  }
}
