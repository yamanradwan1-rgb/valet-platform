import { verify } from "node:crypto";
import { admissionKeyId } from "./typed-admission-key.mjs";

// Offline plan verification only. A real independently authenticated operator
// boundary and registry SQL transition must still be built and attested.
const CASE_FIELDS = [
  "caseId", "audience", "purpose", "key", "from", "to",
  "expectedAdmissionVersion", "expectedMaterialDigest", "evidenceRef",
  "independentIdentityVerificationRef", "operatorId",
  "notBeforeMs", "expiresAtMs",
];
const ROLES = ["CASE_VERIFIER", "SECURITY_APPROVER"];
const STATES = new Set(["ADMIT", "HOLD", "RETIRE"]);

function sorted(value) {
  if (Array.isArray(value)) return value.map(sorted);
  if (value && typeof value === "object" && !Buffer.isBuffer(value)) {
    const result = {};
    for (const key of Object.keys(value).sort()) result[key] = sorted(value[key]);
    return result;
  }
  return value;
}

export function canonicalCaseBytes(caseBody) {
  return Buffer.from(JSON.stringify(sorted(caseBody)), "utf8");
}

function validCase(body, nowMs) {
  if (!body || typeof body !== "object" || Array.isArray(body) ||
      Object.keys(body).length !== CASE_FIELDS.length ||
      CASE_FIELDS.some((field) => !Object.hasOwn(body, field))) {
    throw new Error("L1_INVALID_CASE_SHAPE");
  }
  const expectedPurpose = body.to === "HOLD" ? "L1_HOLD" :
    body.to === "RETIRE" ? "L1_RETIRE" : "L1_ADMIT";
  if (!STATES.has(body.from) || !STATES.has(body.to) ||
      body.from === body.to || body.purpose !== expectedPurpose ||
      body.from === "RETIRE" || body.to === "ADMIT" && body.from !== "HOLD") {
    throw new Error("L1_INVALID_TRANSITION");
  }
  admissionKeyId(body.key);
  if (body.audience !== body.key.audience) throw new Error("L1_CASE_SCOPE");
  if (!Number.isSafeInteger(body.expectedAdmissionVersion) ||
      body.expectedAdmissionVersion < 1 ||
      typeof body.expectedMaterialDigest !== "string" ||
      !/^[a-f0-9]{64}$/.test(body.expectedMaterialDigest)) {
    throw new Error("L1_CASE_VERSION");
  }
  for (const field of ["caseId", "evidenceRef", "operatorId"]) {
    if (typeof body[field] !== "string" || body[field].length < 8 ||
        body[field].length > 160) throw new Error("L1_CASE_EVIDENCE");
  }
  if (typeof body.independentIdentityVerificationRef !== "string" ||
      body.independentIdentityVerificationRef.length < 8 ||
      body.independentIdentityVerificationRef.length > 160) {
    throw new Error("L1_UNVERIFIED_INDEPENDENT_IDENTITY");
  }
  if (!Number.isSafeInteger(nowMs) ||
      !Number.isSafeInteger(body.notBeforeMs) ||
      !Number.isSafeInteger(body.expiresAtMs) ||
      body.notBeforeMs > nowMs || nowMs >= body.expiresAtMs ||
      body.expiresAtMs - body.notBeforeMs > 15 * 60 * 1000) {
    throw new Error("L1_CASE_EXPIRED");
  }
}

// The trustedKeys argument MUST originate from an external, independently
// attested operator trust store; a key supplied in the case is NEVER trusted.
// Required attestation roles use separate key identities. No secret material
// is serialized in a verified result.
export function verifyRecoveryCase(envelope, trustedKeys, nowMs) {
  if (!trustedKeys || typeof trustedKeys !== "object" ||
      !Array.isArray(envelope?.signatures)) {
    throw new Error("L1_OPERATOR_TRUST_NOT_CONFIGURED");
  }
  validCase(envelope.body, nowMs);
  const signed = canonicalCaseBytes(envelope.body);
  const accepted = new Map();
  for (const signature of envelope.signatures) {
    if (!signature || !ROLES.includes(signature.role) ||
        typeof signature.keyId !== "string" ||
        typeof signature.base64Signature !== "string") {
      throw new Error("L1_INVALID_CASE_SIGNATURE");
    }
    const trusted = trustedKeys[signature.keyId];
    if (!trusted || trusted.role !== signature.role ||
        trusted.enabled !== true || !trusted.publicKey ||
        accepted.has(signature.role) || signature.base64Signature.length > 256 ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(signature.base64Signature)) {
      throw new Error("L1_UNTRUSTED_CASE_SIGNER");
    }
    let valid = false;
    try {
      valid = verify(null, signed, trusted.publicKey,
        Buffer.from(signature.base64Signature, "base64"));
    } catch {
      throw new Error("L1_INVALID_CASE_SIGNATURE");
    }
    if (!valid) throw new Error("L1_INVALID_CASE_SIGNATURE");
    accepted.set(signature.role, signature.keyId);
  }
  if (!ROLES.every((role) => accepted.has(role)) ||
      accepted.get(ROLES[0]) === accepted.get(ROLES[1])) {
    throw new Error("L1_INDEPENDENT_APPROVAL_REQUIRED");
  }
  // This is only a verified *case envelope*, never a DB-issued privilege.
  return Object.freeze({
    caseId: envelope.body.caseId,
    operatorId: envelope.body.operatorId,
    key: envelope.body.key,
    from: envelope.body.from,
    to: envelope.body.to,
    expectedAdmissionVersion: envelope.body.expectedAdmissionVersion,
    expectedMaterialDigest: envelope.body.expectedMaterialDigest,
    independentIdentityVerificationRef:
      envelope.body.independentIdentityVerificationRef,
    evidenceRef: envelope.body.evidenceRef,
    purpose: envelope.body.purpose,
    approvedBy: Object.freeze([...accepted.values()].sort()),
  });
}
