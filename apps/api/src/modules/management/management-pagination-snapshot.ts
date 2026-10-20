import { createHmac, timingSafeEqual } from "node:crypto";
import { deflateRawSync, inflateRawSync } from "node:zlib";

import type { PostgresTransaction } from "../../common/database/postgres";
import { ApiTransportValidationError } from "../../common/http/api-errors";

const cursorPrefix = "m2";
const signatureLength = 43;
const maximumCursorLength = 4096;
const maximumDecodedLength = 24_576;
const snapshotPattern = /^\d+:\d+:(?:\d+(?:,\d+)*)?$/;

interface SnapshotRow extends Record<string, unknown> {
  readonly now: Date;
  readonly snapshot: string;
  readonly cutoff: string;
}

function secret(): Buffer {
  const value = process.env.ANTI_ABUSE_HMAC_SECRET_B64URL;
  if (value === undefined || !/^[A-Za-z0-9_-]{43}$/.test(value)) {
    throw new Error(
      "ANTI_ABUSE_HMAC_SECRET_B64URL must encode exactly 32 random bytes.",
    );
  }
  const decoded = Buffer.from(value, "base64url");
  if (decoded.length !== 32 || decoded.toString("base64url") !== value) {
    throw new Error(
      "ANTI_ABUSE_HMAC_SECRET_B64URL must encode exactly 32 random bytes.",
    );
  }
  return decoded;
}

function signature(body: string): string {
  return createHmac("sha256", secret())
    .update("management-pagination-cursor:v2", "utf8")
    .update(Buffer.from([0]))
    .update(body, "utf8")
    .digest("base64url");
}

export function requireManagementSnapshot(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length > 16_384 ||
    !snapshotPattern.test(value)
  ) {
    throw new ApiTransportValidationError();
  }
  return value;
}

export async function captureManagementPaginationSnapshot(
  transaction: PostgresTransaction,
): Promise<{
  readonly now: Date;
  readonly snapshot: string;
  readonly cutoff: string;
}> {
  const result = await transaction.query<SnapshotRow>(
    `WITH captured AS MATERIALIZED (
       SELECT clock_timestamp() AS now, pg_current_snapshot()::text AS snapshot
     )
     SELECT now, snapshot,
       to_char(now AT TIME ZONE 'UTC',
         'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cutoff
     FROM captured`,
  );
  const row = result.rows[0];
  if (row === undefined || !(row.now instanceof Date)) {
    throw new Error("Management pagination snapshot is unavailable.");
  }
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(row.cutoff) ||
    row.cutoff.slice(0, 23) !== row.now.toISOString().slice(0, 23)
  ) {
    throw new Error("Management snapshot microsecond cutoff is unavailable.");
  }
  return {
    now: row.now,
    snapshot: requireManagementSnapshot(row.snapshot),
    cutoff: row.cutoff,
  };
}

export function encodeSignedManagementCursor(value: unknown): string {
  const raw = Buffer.from(JSON.stringify(value), "utf8");
  if (raw.byteLength > maximumDecodedLength) {
    throw new Error("Management cursor payload is too large.");
  }
  const body = deflateRawSync(raw).toString("base64url");
  const encoded = `${cursorPrefix}${signature(body)}${body}`;
  if (encoded.length > maximumCursorLength) {
    throw new Error("Management cursor is too large.");
  }
  return encoded;
}

export function decodeSignedManagementCursor(value: string): unknown {
  if (
    value.length < cursorPrefix.length + signatureLength + 1 ||
    value.length > maximumCursorLength ||
    !/^[A-Za-z0-9_-]+$/.test(value) ||
    !value.startsWith(cursorPrefix)
  ) {
    throw new ApiTransportValidationError();
  }
  const providedText = value.slice(
    cursorPrefix.length,
    cursorPrefix.length + signatureLength,
  );
  const body = value.slice(cursorPrefix.length + signatureLength);
  const provided = Buffer.from(providedText, "base64url");
  const expected = Buffer.from(signature(body), "base64url");
  if (
    provided.toString("base64url") !== providedText ||
    provided.length !== expected.length ||
    !timingSafeEqual(provided, expected)
  ) {
    throw new ApiTransportValidationError();
  }
  try {
    const raw = inflateRawSync(Buffer.from(body, "base64url"), {
      maxOutputLength: maximumDecodedLength,
    });
    return JSON.parse(raw.toString("utf8")) as unknown;
  } catch {
    throw new ApiTransportValidationError();
  }
}
