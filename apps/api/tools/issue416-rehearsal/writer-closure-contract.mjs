// Source-derived Issue #416 U2 inventory: 11 A, 15 M, 5 P, 3 R, 1 X.
// The existence of an entry here does NOT prove SQL/ACL or deployed closure.
const SIGNED = "AUTHENTICATED_TYPED_WRITER";
const READ = "NONWRITING_CURRENT_AUTH_GUARD";
const OPERATOR = "INDEPENDENT_OPERATOR_COMMAND";
const MAINTENANCE = "BOUNDED_MAINTENANCE_NO_STAFF_SIGNER";
const FIXTURE = "NONPRODUCTION_EXECUTION_DENIED";

const overrides = Object.freeze({
  A10: READ, A11: READ, M07: READ, R01: READ,
  M13: MAINTENANCE, P05: MAINTENANCE,
  M14: OPERATOR, M15: OPERATOR, P01: OPERATOR, P02: OPERATOR,
  P03: FIXTURE, P04: FIXTURE,
});

export const WRITER_FAMILIES = Object.freeze([
  ...Array.from({ length: 11 }, (_, i) => `A${String(i + 1).padStart(2, "0")}`),
  ...Array.from({ length: 15 }, (_, i) => `M${String(i + 1).padStart(2, "0")}`),
  ...Array.from({ length: 5 }, (_, i) => `P${String(i + 1).padStart(2, "0")}`),
  ...Array.from({ length: 3 }, (_, i) => `R${String(i + 1).padStart(2, "0")}`),
  "X01",
].map((id) => Object.freeze({ id, contract: overrides[id] ?? SIGNED })));

export const RESERVED_SECURITY_AUDIT_EVENTS = Object.freeze([
  "STAFF_LOGIN_SESSION_CREATED",
  "MFA_TOTP_ACTIVATED",
  "MFA_RECOVERY_CODE_USED",
  "MFA_FACTOR_REENROLLMENT_STARTED",
  "MFA_RECOVERY_CODES_REISSUED",
  "STAFF_PASSWORD_RESET_LINK_ISSUED",
  "STAFF_PASSWORD_RESET_PASSWORD_CHANGED",
]);

export function assessWriterClosure(entries) {
  const expected = new Map(WRITER_FAMILIES.map((item) => [item.id, item.contract]));
  const declared = new Map();
  const unexpected = [];
  if (Array.isArray(entries)) {
    for (const entry of entries) {
      if (!entry || typeof entry.id !== "string" ||
          !expected.has(entry.id) || declared.has(entry.id)) {
        unexpected.push(entry?.id ?? "INVALID");
        continue;
      }
      declared.set(entry.id, entry);
    }
  }
  const items = WRITER_FAMILIES.map(({ id, contract }) => {
    const entry = declared.get(id);
    const completeShape = entry?.contract === contract &&
      entry?.status === "VERIFIED" &&
      typeof entry?.sourceSha === "string" && /^[a-f0-9]{40}$/.test(entry.sourceSha) &&
      typeof entry?.evidenceRef === "string" && entry.evidenceRef.length >= 8 &&
      typeof entry?.verifier === "string" && entry.verifier.length >= 4;
    return Object.freeze({
      id, contract,
      status: completeShape ? "DECLARED_NOT_ATTESTED" : "BLOCKED",
    });
  });
  return Object.freeze({
    status: "SOURCE_INVENTORY_ONLY_NO_RELEASE_AUTHORITY",
    expectedWriterFamilies: 35,
    declared: items.filter((item) => item.status === "DECLARED_NOT_ATTESTED").length,
    unexpected: Object.freeze(unexpected),
    items: Object.freeze(items),
    canDeclareProductionClosure: false,
  });
}

export function assessOldAuditorClosure(evidence) {
  const declared = Array.isArray(evidence?.genericDeniedEventNames)
    ? evidence.genericDeniedEventNames : [];
  const unique = new Set(declared);
  const unsupported = declared.filter((name) =>
    !RESERVED_SECURITY_AUDIT_EVENTS.includes(name));
  const missing = RESERVED_SECURITY_AUDIT_EVENTS.filter((name) =>
    !unique.has(name));
  const controlOperatorDenied = evidence?.genericControlledOperatorActorDenied === true;
  const atomicDerivedAudit = evidence?.authenticatedAtomicEventAppend === true;
  const historicalMigrationPreserved = evidence?.migration112Unchanged === true;
  const legitimateEventsPreserved = evidence?.legitimateGenericEventsPreserved === true;
  const evidenceShape = typeof evidence?.evidenceRef === "string" &&
    evidence.evidenceRef.length >= 8 &&
    typeof evidence?.verifier === "string" && evidence.verifier.length >= 4;
  const claimedComplete = !missing.length && !unsupported.length &&
    declared.length === unique.size && controlOperatorDenied &&
    atomicDerivedAudit && historicalMigrationPreserved &&
    legitimateEventsPreserved && evidenceShape;
  return Object.freeze({
    status: claimedComplete ? "DECLARED_NOT_ATTESTED" : "BLOCKED",
    missing: Object.freeze(missing),
    unexpected: Object.freeze(unsupported),
    stillRequiresEffectivePgAclAndRuntimeSqlNegative: true,
    canDeclareProductionClosure: false,
  });
}
