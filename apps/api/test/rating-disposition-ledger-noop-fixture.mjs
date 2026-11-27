import { intent } from "./rating-disposition-ledger-fixture.mjs";

const at = (offset) => new Date(Date.now() + offset).toISOString();

export function expiredIntent(overrides = {}) {
  return intent({
    approvedAt: at(-120_000),
    validUntil: at(-60_000),
    recordedAt: at(-119_000),
    ...overrides,
  });
}

export function noOpFrom(original, overrides = {}) {
  return {
    organizationId: original.organizationId,
    locationId: original.locationId,
    visitId: original.visitId,
    caseId: original.caseId,
    approvalId: original.approvalId,
    commandId: original.commandId,
    action: original.action,
    eventId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    intentEventId: original.eventId,
    inspectorId: "independent.privacy.inspector",
    observedAt: at(-2_000),
    recordedAt: at(-1_000),
    reason: "EXPIRED_UNAPPLIED",
    successorIntentEventId: null,
    ...overrides,
  };
}

export function inspectorFor(original, changes = {}) {
  return {
    inspectorId: "independent.privacy.inspector",
    async attestFencedNoOp(_intent, closure) {
      return {
        approvalId: original.approvalId,
        commandId: original.commandId,
        organizationId: original.organizationId,
        locationId: original.locationId,
        visitId: original.visitId,
        caseId: original.caseId,
        action: original.action,
        approvedBy: original.approvedBy,
        approvedAt: original.approvedAt,
        validUntil: original.validUntil,
        inspectorId: closure.inspectorId,
        observedAt: closure.observedAt,
        reason: closure.reason,
        basis: ({
          EXPIRED_UNAPPLIED: "EXPIRY_FENCED",
          DENIED_UNAPPLIED: "DENIAL_FENCED",
          CANCELLED_UNAPPLIED: "CANCELLATION_FENCED",
          SUPERSEDED_NO_RECORD: "SUCCESSOR_CLOSED_FENCED",
        })[closure.reason],
        noCommittedReceipt: true,
        futureExecutionFenced: true,
        ...changes,
      };
    },
  };
}
