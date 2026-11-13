import { createHash } from "node:crypto";
import { admissionKeyId, sameAdmissionKey } from "./typed-admission-key.mjs";
import { verifyRecoveryCase } from "./verified-recovery-case.mjs";

function currentRow(row) {
  admissionKeyId(row?.key);
  if (!["ADMIT", "HOLD", "RETIRE"].includes(row?.disposition) ||
      !Number.isSafeInteger(row?.admissionVersion) ||
      row.admissionVersion < 1 ||
      !/^[0-9a-f]{64}$/.test(row?.materialDigest ?? "")) {
    throw new Error("L1_INVALID_CURRENT_ADMISSION");
  }
}

// A durable independent DENY intent must PRECEDE ADMIT->HOLD/RETIRE.
// No in-process bool, SQL row, or caller-supplied timestamp proves durability.
function checkCheckpoint(current, proof, checkpoint) {
  if (!checkpoint || checkpoint.attested !== true ||
      checkpoint.keyId !== admissionKeyId(current.key) ||
      checkpoint.caseId !== proof.caseId ||
      !Number.isSafeInteger(checkpoint.version) ||
      checkpoint.version !== current.admissionVersion + 1) {
    throw new Error("L1_MONOTONE_CHECKPOINT_REQUIRED");
  }
  if (proof.to !== "ADMIT") {
    if (checkpoint.disposition !== "HOLD" &&
        checkpoint.disposition !== "RETIRE") {
      throw new Error("L1_PENDING_DENY_INTENT_REQUIRED");
    }
  } else if (checkpoint.disposition !== "ADMIT" ||
             checkpoint.priorDispositionsVerified !== true) {
    throw new Error("L1_NEW_ALLOW_AUTHORITY_REQUIRED");
  }
  // Caller cannot prove attestation with this object. This is deliberately
  // an offline-only planner and never yields an authorized SQL operation.
}

export function planControlledTransition({
  current, envelope, trustedKeys, checkpoint, nowMs,
}) {
  currentRow(current);
  const proof = verifyRecoveryCase(envelope, trustedKeys, nowMs);
  if (!sameAdmissionKey(proof.key, current.key) ||
      proof.from !== current.disposition ||
      proof.expectedAdmissionVersion !== current.admissionVersion ||
      proof.expectedMaterialDigest !== current.materialDigest) {
    throw new Error("L1_STALE_ADMISSION_CAS");
  }
  if (current.disposition === "RETIRE" || proof.from === proof.to) {
    throw new Error("L1_TERMINAL_ADMISSION");
  }
  checkCheckpoint(current, proof, checkpoint);
  const opDigest = createHash("sha256").update(JSON.stringify({
    caseId: proof.caseId, key: admissionKeyId(current.key),
    version: current.admissionVersion, materialDigest: current.materialDigest,
    to: proof.to, approval: proof.approvedBy,
  })).digest("hex");
  return Object.freeze({
    status: "OFFLINE_REVIEW_PLAN_NOT_AUTHORIZATION",
    audience: current.key.audience,
    objectKey: current.key,
    rank: current.key.rank,
    preElectedMode: "FOR UPDATE",
    expectedAdmissionVersion: current.admissionVersion,
    nextAdmissionVersion: current.admissionVersion + 1,
    expectedMaterialDigest: current.materialDigest,
    from: current.disposition,
    to: proof.to,
    operatorId: proof.operatorId,
    independentVerificationRef: proof.independentIdentityVerificationRef,
    caseId: proof.caseId,
    operationDigest: opDigest,
    requires: Object.freeze([
      "W2_PROTECTED_SQL_CAS",
      "CURRENT_HUMAN_OPERATOR_AUTHORITY",
      "PARENT_RANK_LOCKS_BEFORE_ADMISSION_X",
      "ATOMIC_REVOCATION_RECEIPT_AUDIT",
      "INDEPENDENT_MONOTONE_LEDGER_CONFIRMATION",
    ]),
  });
}

// Recovery remains intentionally unavailable until a REAL independent
// operator authority, W2 SQL contract, and durable ledger are connected.
export function executeControlledRecovery() {
  throw new Error("L1_RECOVERY_NOT_CONNECTED_FAIL_CLOSED");
}
