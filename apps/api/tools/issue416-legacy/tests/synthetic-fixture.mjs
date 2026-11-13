import { generateKeyPairSync, sign } from "node:crypto";
import { admissionKey } from "../typed-admission-key.mjs";
import { canonicalCaseBytes } from "../verified-recovery-case.mjs";

export const USER = "00000000-0000-4000-8000-000000000001";
export const ORG = "00000000-0000-4000-8000-000000000002";
export const MEMBER = "00000000-0000-4000-8000-000000000003";
export const LOCATION = "00000000-0000-4000-8000-000000000004";
export const KEY = admissionKey({ audience: "issue416-w5-test",
  kind: "U", ids: [USER] });
export const DIGEST = "ab".repeat(32);
export const NOW = 2_000_000_000_000;

const verifying = generateKeyPairSync("ed25519");
const approving = generateKeyPairSync("ed25519");
export const TRUST = Object.freeze({
  synthetic_case_verifier: {
    role: "CASE_VERIFIER", enabled: true, publicKey: verifying.publicKey,
  },
  synthetic_security_approver: {
    role: "SECURITY_APPROVER", enabled: true, publicKey: approving.publicKey,
  },
});

export function fixtureCase(overrides = {}, tamper = null) {
  const body = {
    caseId: "synthetic-case-001",
    audience: KEY.audience,
    purpose: "L1_ADMIT",
    key: KEY,
    from: "HOLD",
    to: "ADMIT",
    expectedAdmissionVersion: 1,
    expectedMaterialDigest: DIGEST,
    evidenceRef: "synthetic-independent-roster-001",
    independentIdentityVerificationRef: "synthetic-human-contact-001",
    operatorId: "synthetic-vaylet-operator-001",
    notBeforeMs: NOW - 60_000,
    expiresAtMs: NOW + 60_000,
    ...overrides,
  };
  const signed = canonicalCaseBytes(body);
  const signatures = [
    { role: "CASE_VERIFIER", keyId: "synthetic_case_verifier",
      base64Signature: sign(null, signed, verifying.privateKey).toString("base64") },
    { role: "SECURITY_APPROVER", keyId: "synthetic_security_approver",
      base64Signature: sign(null, signed, approving.privateKey).toString("base64") },
  ];
  return {
    body: tamper ? { ...body, ...tamper } : body,
    signatures,
  };
}
