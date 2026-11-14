// No synthetic rows or fixture-only tests can produce PG17 acceptance.
export const COMMIT_PHASES = Object.freeze([
  "before-commit",
  "commit-sent",
  "server-committed",
  "server-rolled-back",
]);

export function classifyTransactionEvidence({
  phase,
  serverCommitObserved,
  rollbackObserved,
}) {
  if (
    !COMMIT_PHASES.includes(phase) ||
    typeof serverCommitObserved !== "boolean" ||
    typeof rollbackObserved !== "boolean" ||
    (serverCommitObserved && rollbackObserved)
  ) {
    throw new Error("ISSUE416_RACE_TRANSACTION_PHASE_INVALID");
  }
  if (serverCommitObserved && phase !== "server-committed") {
    throw new Error("ISSUE416_RACE_COMMIT_PHASE_CONFLICT");
  }
  if (rollbackObserved && phase !== "server-rolled-back") {
    throw new Error("ISSUE416_RACE_ROLLBACK_PHASE_CONFLICT");
  }
  if (
    (phase === "server-committed" && !serverCommitObserved) ||
    (phase === "server-rolled-back" && !rollbackObserved)
  ) {
    throw new Error("ISSUE416_RACE_TERMINAL_PHASE_NOT_PROVEN");
  }
  if (phase === "commit-sent" && !serverCommitObserved) return "U";
  if (phase === "server-committed" && serverCommitObserved) return "C";
  if (phase === "server-rolled-back" && rollbackObserved) return "R";
  return "UNRESOLVED_PRECOMMIT";
}

export function assertFailureClassification({
  sqlstate,
  phase,
  rollbackObserved,
  preCommitDisconnectObserved,
}) {
  if (phase === "commit-sent" || phase === "server-committed") return "U";
  if (rollbackObserved !== true) {
    throw new Error("ISSUE416_RACE_ROLLBACK_EVIDENCE_MISSING");
  }
  if (["40P01", "40001", "55P03", "57014", "25P02"].includes(sqlstate)) {
    return "T"; // SQL failure is bounded transient only with confirmed ROLLBACK.
  }
  if (/^08/.test(sqlstate) || sqlstate === "57P01") {
    if (phase !== "before-commit" || preCommitDisconnectObserved !== true) {
      throw new Error("ISSUE416_RACE_DISCONNECT_PHASE_UNVERIFIED");
    }
    return "D";
  }
  throw new Error("ISSUE416_RACE_FAILURE_CLASSIFICATION_UNSUPPORTED");
}

export function assertNoSecretEvidence(snapshot) {
  const forbidden =
    /password|raw.?token|bearer|hmac|secret|seed|totp|recovery.?code|access.?token|private.?key/i;
  // This is an intentionally *flat*, closed evidence schema. A generic string,
  // nested object, unknown key, array or accessor can carry a raw credential.
  // Even a value looking like an all-uppercase enum is NOT evidence-safe.
  const enumFields = {
    status: ["BLOCKED", "BLOCKED_PG17_NOT_RUN"],
    event: [
      "COMMIT_OBSERVED",
      "ROLLBACK_OBSERVED",
      "PRECOMMIT_DISCONNECT",
      "COMMIT_ACK_LOST",
      "LOCK_TIMEOUT",
    ],
    phase: COMMIT_PHASES,
    direction: ["A-first", "B-first"],
    outcome: ["C", "R", "D", "U", "T", "PG17_NOT_RUN"],
    sqlstate: ["40P01", "40001", "55P03", "57014", "25P02", "08006", "57P01"],
  };
  const integerFields = {
    count: 210,
    caseId: 21,
    auditCount: 210,
    receiptCount: 210,
  };
  const booleanFields = new Set([
    "serverCommitObserved",
    "rollbackObserved",
    "preCommitDisconnectObserved",
    "namedFenceVerified",
  ]);
  if (
    !snapshot ||
    typeof snapshot !== "object" ||
    Array.isArray(snapshot) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(snapshot))
  ) {
    throw new Error("ISSUE416_RACE_EVIDENCE_SCHEMA_INVALID");
  }
  const keys = Reflect.ownKeys(snapshot);
  if (keys.some((key) => typeof key !== "string")) {
    throw new Error("ISSUE416_RACE_EVIDENCE_SCHEMA_INVALID");
  }
  if (keys.some((key) => forbidden.test(key))) {
    throw new Error("ISSUE416_RACE_SECRET_EVIDENCE_FORBIDDEN");
  }
  if (keys.length === 0) {
    throw new Error("ISSUE416_RACE_EVIDENCE_SCHEMA_INVALID");
  }
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(snapshot, key);
    if (!descriptor || !("value" in descriptor)) {
      throw new Error("ISSUE416_RACE_EVIDENCE_SCHEMA_INVALID");
    }
    const value = descriptor.value;
    if (Object.hasOwn(enumFields, key)) {
      if (!enumFields[key].includes(value)) {
        throw new Error("ISSUE416_RACE_UNREDACTED_STRING_EVIDENCE_FORBIDDEN");
      }
    } else if (Object.hasOwn(integerFields, key)) {
      if (
        !Number.isSafeInteger(value) ||
        value < (key === "caseId" ? 1 : 0) ||
        value > integerFields[key]
      ) {
        throw new Error("ISSUE416_RACE_EVIDENCE_NUMBER_INVALID");
      }
    } else if (booleanFields.has(key)) {
      if (typeof value !== "boolean") {
        throw new Error("ISSUE416_RACE_EVIDENCE_BOOLEAN_INVALID");
      }
    } else {
      throw new Error("ISSUE416_RACE_EVIDENCE_UNKNOWN_FIELD");
    }
  }
  return true;
}
