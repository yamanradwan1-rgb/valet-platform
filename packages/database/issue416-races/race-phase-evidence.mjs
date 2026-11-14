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
  const keys = (value) => {
    if (!value || typeof value !== "object") return [];
    return Object.entries(value).flatMap(([key, child]) => [
      key,
      ...keys(child),
    ]);
  };
  if (keys(snapshot).some((key) => forbidden.test(key))) {
    throw new Error("ISSUE416_RACE_SECRET_EVIDENCE_FORBIDDEN");
  }
  // No free-form string payloads are accepted into persisted evidence. Codes,
  // UUIDs and counts are held in a separate narrow, typed runtime witness.
  const values = (value) => {
    if (typeof value === "string") return [value];
    if (!value || typeof value !== "object") return [];
    return Object.values(value).flatMap(values);
  };
  if (
    values(snapshot).some(
      (value) =>
        !/^(?:[0-9a-f]{8}-[0-9a-f-]{27,}|[A-Z][A-Z0-9_]{0,63}|\d{1,12})$/.test(
          value,
        ),
    )
  ) {
    throw new Error("ISSUE416_RACE_UNREDACTED_STRING_EVIDENCE_FORBIDDEN");
  }
  return true;
}
