import type { PostgresPool } from "../../../common/database/postgres";
import { withGeneralDatabaseDeadline } from "../../../common/database/runtime-database-deadline";
import type {
  OcrObservedResult,
  OcrSettlementHandle,
} from "./ocr-settlement-contract";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const failureClasses = new Set([
  "NONE",
  "TIMEOUT",
  "NETWORK",
  "PROVIDER",
  "PARSE",
  "CANCELLED",
  "OTHER",
]);
const accountAliasPattern = /^[a-z][a-z0-9_-]{0,63}$/;

function assertHandle(handle: OcrSettlementHandle): string {
  if (
    ![
      handle.attemptId,
      handle.organizationId,
      handle.membershipId,
      handle.locationId,
      handle.periodId,
      handle.ownerNonce,
    ].every((value) => uuidPattern.test(value)) ||
    !accountAliasPattern.test(handle.accountAlias)
  ) {
    throw new Error("Invalid internal OCR settlement handle.");
  }
  const revision = handle.revision;
  if (
    (typeof revision === "number" && !Number.isSafeInteger(revision)) ||
    (typeof revision === "string" && !/^[0-9]+$/.test(revision))
  ) {
    throw new Error("Invalid internal OCR settlement revision.");
  }
  const normalized = BigInt(revision);
  if (normalized < 1n || normalized > 9223372036854775807n) {
    throw new Error("Invalid internal OCR settlement revision.");
  }
  return normalized.toString();
}

function assertObservation(observation: OcrObservedResult): void {
  if (
    !Number.isInteger(observation.durationMs) ||
    observation.durationMs < 0 ||
    observation.durationMs > 120000 ||
    !failureClasses.has(observation.failureClass)
  ) {
    throw new Error("Invalid OCR settlement observation.");
  }
  if (observation.fetchInvoked === true) {
    if (
      observation.disposition !== "UNKNOWN" ||
      !(
        (observation.observationClass === "HTTP_COMPLETE" &&
          ["2XX", "4XX", "5XX"].includes(observation.httpClass)) ||
        (observation.observationClass === "UNCERTAIN" &&
          observation.httpClass === "NONE")
      )
    ) {
      throw new Error("An invoked OCR fetch cannot release remote exposure.");
    }
  } else if (
    observation.fetchInvoked !== false ||
    observation.disposition !== "NOT_SENT" ||
    observation.observationClass !== "NOT_INVOKED" ||
    observation.httpClass !== "NONE" ||
    !["NONE", "CANCELLED", "OTHER"].includes(observation.failureClass)
  ) {
    throw new Error("NOT_SENT requires verified live pre-fetch evidence.");
  }
}

/**
 * One attempt-only CAS. A false return means stale/foreign/terminal ownership;
 * a thrown DB error leaves durable capacity held for off-path detection.
 * Neither case retries provider I/O or adjusts admission spent counters.
 */
export async function settleOcr(
  pool: PostgresPool,
  handle: OcrSettlementHandle,
  observation: OcrObservedResult,
): Promise<boolean> {
  const revision = assertHandle(handle);
  assertObservation(observation);
  const result = await withGeneralDatabaseDeadline(500, () =>
    pool.query<{ settled: boolean }>(
      `SELECT public.ocr_settle(
         $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid,
         $6::text, $7::uuid, $8::bigint, $9::text, $10::text,
         $11::text, $12::text, $13::integer
       ) AS settled`,
      [
        handle.attemptId,
        handle.organizationId,
        handle.membershipId,
        handle.locationId,
        handle.periodId,
        handle.accountAlias,
        handle.ownerNonce,
        revision,
        observation.disposition,
        observation.observationClass,
        observation.httpClass,
        observation.failureClass,
        observation.durationMs,
      ],
    ),
  );
  if (result.rowCount !== 1 || typeof result.rows[0]?.settled !== "boolean") {
    throw new Error("OCR settlement result unavailable.");
  }
  return result.rows[0].settled;
}
