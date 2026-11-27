import {
  type CommittedDispositionReceiptReader,
  type DispositionAction,
  type DispositionOutcome,
  type DispositionSqlApplier,
  type LedgerEvent,
  type ReceiptInput,
} from "./rating-disposition-ledger-types";

/** Exact W2 E-only callable. The executor must commit before returning. */
export const APPLY_APPROVED_DISPOSITION_SQL =
  "SELECT public.apply_guest_rating_comment_disposition($1::uuid) AS outcome";

interface SqlOutcomeRow { readonly outcome: unknown }

/** Must connect as the separately authenticated E executor, never as API R. */
export interface ApprovedDispositionSqlExecutor {
  executeCommitted(
    sql: typeof APPLY_APPROVED_DISPOSITION_SQL,
    parameters: readonly [string],
  ): Promise<SqlOutcomeRow | null>;
}

/** Read only via an independently authorized scoped receipt inspector. */
export interface DispositionReceiptMetadata {
  readonly approvalId: string;
  readonly organizationId: string;
  readonly locationId: string;
  readonly visitId: string;
  readonly caseId: string;
  readonly action: DispositionAction;
  readonly approvedBy: string;
  readonly approvedAt: string;
  readonly validUntil: string;
  readonly completedAt: string | null;
  readonly executedBy: string | null;
  readonly outcome: DispositionOutcome | null;
}

/** A/E have no SELECT on this table. Provisioning this separate inspector
 *  requires explicit authority; never fall back to R or raw child SQL. */
export interface AuthorizedDispositionReceiptSource {
  readExactApproval(approvalId: string):
    Promise<DispositionReceiptMetadata | null>;
}

const outcomes: Record<DispositionAction, readonly DispositionOutcome[]> = {
  HOLD: ["HELD"],
  ERASE: ["ERASED", "HELD_PENDING", "NO_RECORD_CLOSED"],
  RELEASE: ["RELEASED", "ERASED"],
};

function canonicalTime(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function matchesIntent(
  intent: LedgerEvent & { kind: "INTENT" },
  row: DispositionReceiptMetadata | null,
): row is DispositionReceiptMetadata {
  return row !== null &&
    row.approvalId === intent.approvalId &&
    row.organizationId === intent.organizationId &&
    row.locationId === intent.locationId &&
    row.visitId === intent.visitId &&
    row.caseId === intent.caseId &&
    row.action === intent.action &&
    row.approvedBy === intent.approvedBy &&
    canonicalTime(row.approvedAt) === intent.approvedAt &&
    canonicalTime(row.validUntil) === intent.validUntil;
}

function outcomeIsValid(action: DispositionAction, value: unknown):
  value is DispositionOutcome {
  return typeof value === "string" && outcomes[action].includes(
    value as DispositionOutcome,
  );
}

function complete(row: DispositionReceiptMetadata): boolean {
  return canonicalTime(row.completedAt) !== null &&
    typeof row.executedBy === "string" && row.executedBy.length > 0 &&
    row.executedBy !== row.approvedBy &&
    canonicalTime(row.approvedAt) !== null &&
    canonicalTime(row.completedAt)! >= canonicalTime(row.approvedAt)! &&
    outcomeIsValid(row.action, row.outcome);
}

export function createDispositionSqlAdapter(
  executor: ApprovedDispositionSqlExecutor,
  inspector: AuthorizedDispositionReceiptSource,
): DispositionSqlApplier & CommittedDispositionReceiptReader {
  return {
    async lookupCommittedIntent(intent) {
      try {
        const row = await inspector.readExactApproval(intent.approvalId);
        if (!matchesIntent(intent, row)) return "UNKNOWN";
        if (row.completedAt === null && row.executedBy === null &&
            row.outcome === null) return "PENDING";
        return complete(row) ? "COMMITTED" : "UNKNOWN";
      } catch { return "UNKNOWN"; }
    },
    async applyVerifiedIntent(intent) {
      try {
        // W2 locks exact approval/visit/child, checks approval/executor,
        // final expiry and session under READ COMMITTED, then commits receipt.
        const response = await executor.executeCommitted(
          APPLY_APPROVED_DISPOSITION_SQL, [intent.approvalId],
        );
        if (!response || !outcomeIsValid(intent.action, response.outcome)) {
          // None of these statuses has a W2 committed SQL completion row.
          // They are distinct from successful erasure and need fenced
          // no-op evidence before any ledger terminal closure.
          if (response?.outcome === "NO_RECORD_WAIT") return "NO_RECORD_WAIT";
          if (response?.outcome === "EXPIRED") return "EXPIRED";
          if (response?.outcome === "DENIED") return "DENIED";
          return "UNKNOWN";
        }
        const committed = await inspector.readExactApproval(intent.approvalId);
        if (!matchesIntent(intent, committed) ||
            !complete(committed) || committed.outcome !== response.outcome)
          return "UNKNOWN";
        return "COMMITTED";
      } catch { return "UNKNOWN"; }
    },
    async confirmCommitted(
      intent: LedgerEvent & { kind: "INTENT" }, input: ReceiptInput,
    ) {
      try {
        const row = await inspector.readExactApproval(input.approvalId);
        return matchesIntent(intent, row) &&
          intent.eventId === input.intentEventId &&
          intent.commandId === input.commandId &&
          row.approvalId === input.approvalId &&
          row.organizationId === input.organizationId &&
          row.locationId === input.locationId &&
          row.visitId === input.visitId &&
          row.caseId === input.caseId &&
          row.action === input.action &&
          complete(row) &&
          row.outcome === input.outcome &&
          row.executedBy === input.executorId &&
          canonicalTime(row.completedAt) === input.executedAt;
      } catch { return false; }
    },
  };
}
