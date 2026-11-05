import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { performance } from "node:perf_hooks";

import type {
  PostgresPool,
  PostgresTransaction,
} from "../../../common/database/postgres";
import { withGeneralDatabaseDeadline } from "../../../common/database/runtime-database-deadline";
import { RUNTIME_POSTGRES_POOL } from "../../../common/database/runtime-database.module";
import { inPostgresTransaction } from "../../../common/database/postgres-transaction";
import type { StaffSessionContext } from "../../auth/staff-session-context";
import { CustodyStaffAuthorizationError } from "../../staff/custody-staff-authorizer";
import {
  authorizeOcrAdmission,
  type OcrAuthorizedScope,
} from "./plate-ocr-admission-authorization";
import {
  createOcrAdmissionPermit,
  type OcrAdmissionPermit,
} from "./plate-ocr-admission-permit";

const ADMISSION_TRANSACTION_MS = 500;
const ADMISSION_STATEMENT_MS = 250;
const ADMISSION_LOCK_MS = 50;
const uuidPattern = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

export interface OcrAdmittedAttempt {
  readonly attemptId: string;
  readonly organizationId: string;
  readonly membershipId: string;
  readonly locationId: string;
  readonly periodId: string;
  readonly accountAlias: string;
  readonly ownerNonce: string;
  /** PostgreSQL BIGINT is read as an exact decimal string by node-postgres. */
  readonly revision: string;
}

export type OcrAdmissionReason =
  | "POLICY_DISABLED"
  | "DISABLED"
  | "NO_PERIOD"
  | "CLOCK_UNSAFE"
  | "QUOTA"
  | "CONCURRENCY"
  | "RATE"
  | "LIMITED"
  | "STALE_AUTH"
  | "LOCK_BUSY"
  | "DATABASE_UNAVAILABLE";

export type OcrAdmissionResult =
  | {
      readonly status: "ADMITTED";
      readonly attempt: OcrAdmittedAttempt;
      readonly permit: OcrAdmissionPermit;
    }
  | { readonly status: "UNAVAILABLE"; readonly reason: OcrAdmissionReason };

type AdmissionRow = {
  readonly decision: unknown;
  readonly attempt_id: unknown;
  readonly organization_id: unknown;
  readonly membership_id: unknown;
  readonly location_id: unknown;
  readonly period_id: unknown;
  readonly account_alias: unknown;
  readonly owner_nonce: unknown;
  readonly revision: unknown;
  readonly admitted_at: unknown;
  readonly execution_deadline: unknown;
  readonly remaining_authorized_ms: unknown;
};

const deniedDecisions = new Set<OcrAdmissionReason>([
  "DISABLED",
  "NO_PERIOD",
  "CLOCK_UNSAFE",
  "QUOTA",
  "CONCURRENCY",
  "RATE",
  "LIMITED",
  "STALE_AUTH",
]);

function validUuid(value: unknown): value is string {
  return typeof value === "string" && uuidPattern.test(value);
}

function committedAttempt(
  row: AdmissionRow,
  scope: OcrAuthorizedScope,
): { attempt: OcrAdmittedAttempt; remainingAuthorizedMs: number } {
  if (
    !validUuid(row.attempt_id) ||
    !validUuid(row.period_id) ||
    !validUuid(row.owner_nonce) ||
    row.organization_id !== scope.organizationId ||
    row.membership_id !== scope.membershipId ||
    row.location_id !== scope.locationId ||
    typeof row.account_alias !== "string" ||
    row.account_alias.length < 1 ||
    !(
      (typeof row.revision === "string" &&
        /^[1-9][0-9]*$/.test(row.revision)) ||
      (typeof row.revision === "number" &&
        Number.isSafeInteger(row.revision) &&
        row.revision > 0)
    ) ||
    !(row.admitted_at instanceof Date) ||
    !Number.isFinite(row.admitted_at.getTime()) ||
    !(row.execution_deadline instanceof Date) ||
    !Number.isFinite(row.execution_deadline.getTime()) ||
    !Number.isInteger(row.remaining_authorized_ms) ||
    (row.remaining_authorized_ms as number) < 0
  )
    throw new Error("Malformed private OCR admission proof.");

  const attempt = Object.freeze({
    attemptId: row.attempt_id,
    organizationId: scope.organizationId,
    membershipId: scope.membershipId,
    locationId: scope.locationId,
    periodId: row.period_id,
    accountAlias: row.account_alias,
    ownerNonce: row.owner_nonce,
    revision: String(row.revision),
    // Never stringify a settlement authority token into diagnostics or a DTO.
    toJSON: () => "[private OCR attempt]",
  }) as OcrAdmittedAttempt;
  return {
    attempt,
    remainingAuthorizedMs: row.remaining_authorized_ms as number,
  };
}

function isOcrNowait(error: unknown): boolean {
  const pg = error as { code?: unknown; message?: unknown } | null;
  return (
    pg?.code === "55P03" &&
    typeof pg.message === "string" &&
    /^could not obtain lock on row in relation "ocr_(?:platform_control|organization_control|budget_periods|organization_allocations)"$/.test(
      pg.message,
    )
  );
}

async function requestAdmission(
  transaction: PostgresTransaction,
  context: StaffSessionContext,
  locationId: string,
  providerTimeoutMs: number,
): Promise<
  | { readonly status: "UNAVAILABLE"; readonly reason: OcrAdmissionReason }
  | {
      readonly status: "ADMITTED";
      readonly attempt: OcrAdmittedAttempt;
      readonly proofStartedAtMs: number;
      readonly remainingAuthorizedMs: number;
    }
> {
  await transaction.query(
    `SELECT set_config('statement_timeout',$1,true),
            set_config('lock_timeout',$2,true)`,
    [`${ADMISSION_STATEMENT_MS}ms`, `${ADMISSION_LOCK_MS}ms`],
  );
  const scope = await authorizeOcrAdmission(transaction, context, locationId);
  if (scope === null)
    return { status: "UNAVAILABLE", reason: "POLICY_DISABLED" };

  // This is tP: the start of the last time-sensitive database proof in A.
  const proofStartedAtMs = performance.now();
  const result = await transaction.query<AdmissionRow>(
    "SELECT * FROM public.ocr_admit($1::uuid,$2::uuid,$3::uuid,$4::integer)",
    [
      context.staffAuthSessionId,
      scope.membershipId,
      scope.locationId,
      providerTimeoutMs,
    ],
  );
  if (result.rows.length !== 1)
    throw new Error("Unexpected OCR admission response.");
  const row = result.rows[0]!;
  if (row.decision !== "ADMITTED") {
    if (deniedDecisions.has(row.decision as OcrAdmissionReason)) {
      return {
        status: "UNAVAILABLE",
        reason: row.decision as OcrAdmissionReason,
      };
    }
    throw new Error("Unexpected private OCR admission decision.");
  }
  const committed = committedAttempt(row, scope);
  return { status: "ADMITTED", ...committed, proofStartedAtMs };
}

/** Call only after authenticated input preflight and a verified provider config. */
@Injectable()
export class PlateOcrAdmissionExecutor {
  constructor(
    @Inject(RUNTIME_POSTGRES_POOL) private readonly pool: PostgresPool,
  ) {}

  async admit(
    context: StaffSessionContext,
    targetLocationId: string,
    providerTimeoutMs: number,
  ): Promise<OcrAdmissionResult> {
    if (
      !Number.isInteger(providerTimeoutMs) ||
      providerTimeoutMs < 100 ||
      providerTimeoutMs > 10_000 ||
      !validUuid(targetLocationId)
    ) {
      return { status: "UNAVAILABLE", reason: "DATABASE_UNAVAILABLE" };
    }
    try {
      // The transaction helper returns only after an unambiguous COMMIT. On an
      // ambiguous COMMIT no capability leaves this method, even if A debited.
      const admitted = await withGeneralDatabaseDeadline(
        ADMISSION_TRANSACTION_MS,
        () =>
          inPostgresTransaction(this.pool, (transaction) =>
            requestAdmission(
              transaction,
              context,
              targetLocationId,
              providerTimeoutMs,
            ),
          ),
      );
      if (admitted.status === "UNAVAILABLE") return admitted;
      return {
        status: "ADMITTED",
        attempt: admitted.attempt,
        permit: createOcrAdmissionPermit(admitted),
      };
    } catch (error) {
      if (
        error instanceof UnauthorizedException ||
        error instanceof CustodyStaffAuthorizationError
      )
        throw error;
      // A failed NOWAIT statement aborts its transaction: let the transaction
      // helper roll back first, then classify only the known OCR row-lock error.
      if (isOcrNowait(error))
        return { status: "UNAVAILABLE", reason: "LOCK_BUSY" };
      // Includes unknown COMMIT, pool exhaustion, lock and statement deadlines.
      // No attempt is retried or sent without an explicit committed permit.
      return { status: "UNAVAILABLE", reason: "DATABASE_UNAVAILABLE" };
    }
  }
}
