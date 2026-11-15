import { CORE_RACES } from "./race-cases-core.mjs";
import {
  ADMISSION_EXTRA_GATES,
  ADMISSION_RACES,
} from "./race-cases-admission.mjs";

export const RACE_CASES = Object.freeze([...CORE_RACES, ...ADMISSION_RACES]);
export const DIRECTIONS = Object.freeze(["A-first", "B-first"]);
export const OUTCOMES = Object.freeze(["C", "R", "D", "U", "T"]);
const REVERSE_OUTCOMES = Object.freeze({
  C: "B committed before A's revalidated transition can commit",
  R: "B server-confirmed rollback; A can revalidate current authority",
  D: "B disconnected before COMMIT; rollback established before A proceeds",
  U: "B's COMMIT acknowledgment lost; A waits for new-lease reconciliation",
  T: "A times out behind B's held named fence, no A transition claimed",
});

export const GLOBAL_NEGATIVES = Object.freeze([
  "actual pg_blocking_pids/pg_locks match intended named fence, not a timed sleep",
  "distinct A/B backend PIDs; exact READ COMMITTED and two-connection pool",
  "reverse UUID input order and actor/target IDs, cross expiry during blocked wait",
  "precommit disconnect D confirms rollback; lost COMMIT acknowledgment U confirms receipt",
  "T proves full B rollback and fresh-lease reauthorization; no stale proof replay",
  "no audit/receipt/secret/credential partial write after failure",
  "audit insertion failure after domain mutation rolls back entire command",
  "new lease revalidates version/key/assurance/entitlement after every wait",
  "foreign-key/unique/audit graph edges observed, not inferred from SQL text",
  "same operation across tenant or purpose cannot reuse authority or receipt",
  "all credential, password, seed, HMAC and bearer fields absent from evidence logs",
]);

export function getRaceCase(id) {
  if (!Number.isInteger(id) || id < 1 || id > 21) {
    throw new Error("ISSUE416_RACE_CASE_UNKNOWN");
  }
  return RACE_CASES[id - 1];
}

export function defineTrial(id, direction, outcome) {
  const scenario = getRaceCase(id);
  if (!DIRECTIONS.includes(direction) || !OUTCOMES.includes(outcome)) {
    throw new Error("ISSUE416_RACE_TRIAL_INVALID");
  }
  return Object.freeze({
    id: scenario.id,
    direction,
    outcome,
    barrier: scenario.fence,
    expected:
      direction === "B-first"
        ? `${REVERSE_OUTCOMES[outcome]}; ${scenario.reverse}`
        : outcome === "C"
          ? scenario.committed
          : outcome === "R" || outcome === "D"
            ? scenario.rolledBack
            : outcome === "U"
              ? scenario.unknown
              : scenario.timeout,
    reverseInvariant: direction === "B-first" ? scenario.reverse : null,
    mandatoryNegatives: scenario.admission
      ? ADMISSION_EXTRA_GATES
      : GLOBAL_NEGATIVES,
    evidence: "PG17_NOT_RUN",
  });
}

export function enumerateTrials() {
  return RACE_CASES.flatMap(({ id }) =>
    DIRECTIONS.flatMap((direction) =>
      OUTCOMES.map((outcome) => defineTrial(id, direction, outcome)),
    ),
  );
}

export function assertRaceMatrix() {
  if (
    RACE_CASES.length !== 21 ||
    CORE_RACES.length !== 15 ||
    ADMISSION_RACES.length !== 6 ||
    RACE_CASES.some(
      (entry, i) =>
        entry.id !== i + 1 ||
        Object.values(entry).some((value) => value === "" || value == null),
    )
  ) {
    throw new Error("ISSUE416_RACE_MATRIX_INCOMPLETE");
  }
  if (enumerateTrials().length !== 210) {
    throw new Error("ISSUE416_RACE_BRANCH_COVERAGE_INCOMPLETE");
  }
  return true; // Source enumeration only; never PostgreSQL acceptance.
}
