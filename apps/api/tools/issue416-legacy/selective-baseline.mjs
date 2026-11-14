import { createHash } from "node:crypto";
import {
  admissionKeyId, compareAdmissionKeys, sameAdmissionKey,
} from "./typed-admission-key.mjs";
import { verifyRecoveryCase } from "./verified-recovery-case.mjs";

const SHA256_RE = /^[0-9a-f]{64}$/;
// T0 retires pre-boundary session lineage and disables old push registrations.
// An operator case cannot turn those old credentials into fresh authority.
const LEGACY_NONADMITTABLE = new Set([
  "SESSION", "REFRESH", "PUSH_REGISTRATION",
]);

function snapshotRow(row) {
  const id = admissionKeyId(row?.key);
  if (!SHA256_RE.test(row?.materialDigest ?? "")) {
    throw new Error("L1_UNVERSIONED_SECURITY_MATERIAL");
  }
  if (row?.kind !== undefined && row.kind !== row.key.kind) {
    throw new Error("L1_OBJECT_KIND_MISMATCH");
  }
  if (row?.generation !== undefined &&
      (!Number.isSafeInteger(row.generation) || row.generation < 0)) {
    throw new Error("L1_INVALID_GENERATION");
  }
  return Object.freeze({
    id, key: row.key, materialDigest: row.materialDigest,
    generation: row.generation ?? null,
  });
}

// This prepares a reviewed offline T0 candidate. It does NOT import a registry,
// revoke a session, or claim that supplied snapshot rows are exhaustive.
// ADMIT requires independently signed evidence; otherwise conservative HOLD.
export function buildSelectiveBaseline(snapshot, signedCases, trustedKeys, nowMs) {
  if (!Array.isArray(snapshot) || !Array.isArray(signedCases)) {
    throw new Error("L1_MISSING_ATTESTED_INVENTORY");
  }
  const rows = new Map();
  for (const value of snapshot) {
    const row = snapshotRow(value);
    if (rows.has(row.id)) throw new Error("L1_DUPLICATE_BASELINE_OBJECT");
    rows.set(row.id, row);
  }
  const approved = new Map();
  for (const envelope of signedCases) {
    const proof = verifyRecoveryCase(envelope, trustedKeys, nowMs);
    const id = admissionKeyId(proof.key);
    const row = rows.get(id);
    if (!row || !sameAdmissionKey(row.key, proof.key)) {
      throw new Error("L1_CASE_OBJECT_ABSENT");
    }
    if (LEGACY_NONADMITTABLE.has(row.key.kind)) {
      throw new Error("L1_LEGACY_AUTHORITY_ADMIT_FORBIDDEN");
    }
    if (approved.has(id)) throw new Error("L1_DUPLICATE_CASE_OBJECT");
    if (proof.from !== "HOLD" || proof.to !== "ADMIT" ||
        proof.expectedAdmissionVersion !== 1 ||
        proof.expectedMaterialDigest !== row.materialDigest) {
      throw new Error("L1_CASE_EXPECTED_STATE_CONFLICT");
    }
    approved.set(id, proof);
  }
  // A grant's canonical 49-byte identity names three exact parents. Their
  // presence and separate signed admission are necessary, but not sufficient:
  // real Membership/Location ownership and complete all-status inventory need
  // independent SQL-locked and external roster evidence at T0.
  for (const proof of approved.values()) {
    if (proof.key.kind !== "GRANT") continue;
    const { audience, hex } = proof.key;
    for (const [kind, parentBytes] of [
      ["ORGANIZATION", hex.slice(2, 34)],
      ["MEMBERSHIP", hex.slice(34, 66)],
      ["LOCATION", hex.slice(66, 98)],
    ]) {
      const parentId = `${audience}:${kind}:01${parentBytes}`;
      if (!rows.has(parentId) || !approved.has(parentId)) {
        throw new Error("L1_UNVERIFIED_GRANT_PARENTS");
      }
    }
  }
  const ordered = [...rows.values()].sort((a, b) =>
    compareAdmissionKeys(a.key, b.key));
  const candidate = ordered.map((row) => {
    const proof = approved.get(row.id);
    return Object.freeze({
      key: row.key,
      materialDigest: row.materialDigest,
      generation: row.generation,
      admissionVersion: 1,
      disposition: proof ? "ADMIT" : "HOLD",
      evidenceRef: proof?.evidenceRef ?? null,
      caseId: proof?.caseId ?? null,
    });
  });
  const publicDigest = createHash("sha256").update(JSON.stringify(
    candidate.map((row) => ({
      id: admissionKeyId(row.key), materialDigest: row.materialDigest,
      generation: row.generation, disposition: row.disposition,
      admissionVersion: row.admissionVersion, caseId: row.caseId,
    })),
  )).digest("hex");
  return Object.freeze({
    status: "ISOLATED_CANDIDATE_NOT_SQL_ADMITTED",
    rows: Object.freeze(candidate),
    publicDigest,
    summary: Object.freeze({
      objects: candidate.length,
      admitted: approved.size,
      held: candidate.length - approved.size,
    }),
  });
}

export function selectAdmissionLocks(dependencies, changedKeys = []) {
  if (!Array.isArray(dependencies) || !Array.isArray(changedKeys)) {
    throw new Error("L1_INVALID_DEPENDENCY_SET");
  }
  if (dependencies.length === 0) {
    throw new Error("L1_EMPTY_DEPENDENCY_SET");
  }
  const changed = new Set(changedKeys.map(admissionKeyId));
  const rows = new Map();
  let audience;
  for (const key of dependencies) {
    const id = admissionKeyId(key);
    if (audience !== undefined && audience !== key.audience) {
      throw new Error("L1_CROSS_AUDIENCE_DEPENDENCY");
    }
    audience = key.audience;
    if (rows.has(id)) throw new Error("L1_DUPLICATE_DEPENDENCY");
    rows.set(id, Object.freeze({
      key, rank: key.rank,
      admissionMode: changed.has(id) ? "FOR UPDATE" : "FOR SHARE",
    }));
  }
  if ([...changed].some((id) => !rows.has(id))) {
    throw new Error("L1_UNKNOWN_WRITE_DEPENDENCY");
  }
  return Object.freeze([...rows.values()].sort((a, b) =>
    compareAdmissionKeys(a.key, b.key)));
}

// Pre/post-proof simulation only. W2 SQL must perform the *real* ranked
// row-lock acquisition and execute-time re-read under the SAME transaction.
export function assessAdmissionDependencies(lockedGates, requirements) {
  if (!Array.isArray(lockedGates) || !Array.isArray(requirements) ||
      !lockedGates.length || !requirements.length) {
    return Object.freeze({ allowed: false, reason: "L1_MISSING_GATES" });
  }
  try {
    const gates = new Map();
    for (const gate of lockedGates) {
      const id = admissionKeyId(gate?.key);
      if (gates.has(id)) {
        return Object.freeze({ allowed: false, reason: "L1_DUPLICATE_GATE" });
      }
      gates.set(id, gate);
    }
    const requiredIds = new Set();
    let audience;
    for (const required of requirements) {
      const id = admissionKeyId(required?.key);
      if (requiredIds.has(id)) {
        return Object.freeze({ allowed: false, reason: "L1_DUPLICATE_REQUIREMENT" });
      }
      requiredIds.add(id);
      if (audience !== undefined && audience !== required.key.audience) {
        return Object.freeze({ allowed: false, reason: "L1_CROSS_AUDIENCE_REQUIRED" });
      }
      audience = required.key.audience;
      const gate = gates.get(id);
      if (!gate || gate.disposition !== "ADMIT" ||
          !Number.isSafeInteger(gate.admissionVersion) ||
          gate.admissionVersion < 1 ||
          gate.admissionVersion !== required.admissionVersion ||
          gate.materialDigest !== required.materialDigest ||
          !SHA256_RE.test(gate.materialDigest ?? "") ||
          gate.generation !== (required.generation ?? null)) {
        return Object.freeze({ allowed: false, reason: "L1_ADMISSION_DENIED" });
      }
    }
    if ([...gates.values()].some((gate) => gate.key.audience !== audience)) {
      return Object.freeze({ allowed: false, reason: "L1_ADMISSION_DENIED" });
    }
  } catch {
    return Object.freeze({ allowed: false, reason: "L1_INVALID_GATE_INPUT" });
  }
  return Object.freeze({ allowed: true, reason: "SYNTHETIC_GATE_MATCH_ONLY" });
}
