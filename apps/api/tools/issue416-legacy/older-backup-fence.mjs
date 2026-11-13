import { admissionKeyId } from "./typed-admission-key.mjs";

const STATES = new Set(["ADMIT", "HOLD", "RETIRE"]);

// Conservative planning of an old-snapshot restore. An in-process supplied
// checkpoint cannot certify external durability; no result grants ADMIT.
// Every restored object remains HOLD pending a REAL privileged case/reconcile.
export function reconcileOlderBackup(restoredGates, authorityLedger) {
  if (!Array.isArray(restoredGates)) throw new Error("L1_INVALID_RESTORE");
  const complete = authorityLedger?.independentlyVerified === true &&
    Number.isSafeInteger(authorityLedger?.epoch) &&
    authorityLedger.epoch >= 1 &&
    Array.isArray(authorityLedger?.objects) &&
    authorityLedger?.completeThroughBackupBoundary === true;
  const rows = new Map();
  if (complete) {
    for (const record of authorityLedger.objects) {
      const id = admissionKeyId(record?.key);
      if (rows.has(id) || !STATES.has(record?.disposition) ||
          !Number.isSafeInteger(record?.version) || record.version < 1 ||
          record.epoch !== authorityLedger.epoch) {
        throw new Error("L1_INVALID_INDEPENDENT_LEDGER");
      }
      rows.set(id, record);
    }
  }
  const seen = new Set();
  const results = [];
  for (const restored of restoredGates) {
    const id = admissionKeyId(restored.key);
    if (seen.has(id)) throw new Error("L1_DUPLICATE_RESTORE_OBJECT");
    seen.add(id);
    const ledger = rows.get(id);
    const authoritative = complete && ledger &&
      Number.isSafeInteger(restored.admissionVersion) &&
      restored.admissionVersion >= 1 &&
      ledger.version === restored.admissionVersion &&
      restored.disposition === ledger.disposition &&
      restored.boundaryEpoch === authorityLedger.epoch &&
      !ledger.pendingDeny;
    results.push(Object.freeze({
      key: restored.key,
      disposition: "HOLD",
      independentlyAttestedReconciliationCandidate: Boolean(
        authoritative && restored.disposition === "ADMIT"),
      requiresIndependentRecovery: true,
      reason: authoritative && restored.disposition === "ADMIT"
        ? "L1_OFFLINE_CANDIDATE_STILL_HOLD" : "L1_STALE_OR_UNKNOWN_RESTORE",
    }));
  }
  return Object.freeze({
    status: "ISOLATED_RESTORE_PLAN_NOT_AUTHORIZATION",
    mustKeepProtectedTrafficClosed: true,
    objects: Object.freeze(results),
    // Never auto-run DB updates or restore keys, sessions or recovery codes.
  });
}
