const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DIGEST = /^[0-9a-f]{64}$/;

type A01FinalizationBlocker =
  | "INVALID_CONTEXT"
  | "UNKNOWN_COMMIT"
  | "CROSS_AUDIENCE"
  | "CROSS_OPERATION"
  | "CHANGED_PAYLOAD"
  | "UNTRUSTED_AUDIT_OR_RECEIPT"
  | "CROSS_TENANT"
  | "TERMINAL_OR_MISSING_RESERVATION"
  | "TRUSTED_POST_DOMAIN_FINALIZER_MISSING";

/** No transition to COUNTED/IGNORED is enabled by this source-only review. */
export type A01FinalizationInspection = Readonly<{
  authorized: false;
  blocker: A01FinalizationBlocker;
}>;

/** Never constructed as a privilege: every field can be spoofed by a caller.
 * A real verifier must independently join private immutable receipt,
 * consumed challenge, issuance evidence, original SS/RC and account audit.
 */
export interface A01UntrustedFinalizationObservation {
  readonly audience: string;
  readonly operationId: string;
  readonly purpose: string;
  readonly payloadDigest: string;
  readonly reservationId: string;
  readonly limiterState: string;
  readonly receiptOutcome: string | null;
  readonly auditEventId: string | null;
  readonly subjectUserId: string | null;
  readonly actorKind: string | null;
  readonly organizationId: string | null;
  readonly membershipId: string | null;
  readonly challengeConsumed: boolean;
}

/** An UNKNOWN COMMIT never becomes a rollback because a receipt read misses.
 * The old lease must be abandoned; the new lease must verify real immutable
 * SQL evidence before a purpose-specific finalizer may discount an attempt.
 */
export function inspectUntrustedA01Finalization(
  context: Readonly<{
    deploymentAudience: string;
    operationId: string;
    reservationId: string;
    userId: string;
    payloadDigest: string;
    commitKnowledge: "UNKNOWN" | "CONFIRMED" | "ROLLED_BACK";
  }>,
  row: A01UntrustedFinalizationObservation | undefined,
): A01FinalizationInspection {
  if (!context.deploymentAudience ||
      !UUID.test(context.operationId) || !UUID.test(context.reservationId) ||
      !UUID.test(context.userId) || !DIGEST.test(context.payloadDigest)) {
    return { authorized: false, blocker: "INVALID_CONTEXT" };
  }
  if (context.commitKnowledge === "UNKNOWN") {
    return { authorized: false, blocker: "UNKNOWN_COMMIT" };
  }
  if (!row || row.reservationId !== context.reservationId ||
      row.limiterState !== "PENDING") {
    return { authorized: false, blocker: "TERMINAL_OR_MISSING_RESERVATION" };
  }
  if (row.audience !== context.deploymentAudience) {
    return { authorized: false, blocker: "CROSS_AUDIENCE" };
  }
  if (row.operationId !== context.operationId) {
    return { authorized: false, blocker: "CROSS_OPERATION" };
  }
  if (row.payloadDigest !== context.payloadDigest) {
    return { authorized: false, blocker: "CHANGED_PAYLOAD" };
  }
  if (row.organizationId !== null || row.membershipId !== null) {
    // A01 is globally User-scoped, not a selected Company/Location grant.
    return { authorized: false, blocker: "CROSS_TENANT" };
  }
  if (context.commitKnowledge !== "CONFIRMED" ||
      row.purpose !== "STAFF_LOGIN_COMMIT" ||
      row.receiptOutcome !== "COMPLETED" ||
      row.subjectUserId !== context.userId ||
      row.actorKind !== "ANONYMOUS" ||
      row.auditEventId === null || !UUID.test(row.auditEventId) ||
      !row.challengeConsumed) {
    return { authorized: false, blocker: "UNTRUSTED_AUDIT_OR_RECEIPT" };
  }
  // Even an apparently perfect record can be fabricated from mutable SQL
  // or caller JSON. Never return IGNORED/COUNTED or a permit from this code.
  return { authorized: false, blocker: "TRUSTED_POST_DOMAIN_FINALIZER_MISSING" };
}
