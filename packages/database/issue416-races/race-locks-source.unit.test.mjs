import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { URL } from "node:url";

import { RACE_CASES, defineTrial } from "./race-matrix.mjs";

const locks = readFileSync(
  new URL("../../../docs/plans/issue-416-option-a-locks.md", import.meta.url),
  "utf8",
);
const decision = readFileSync(
  new URL(
    "../issue416-private/ISSUE416_P0A_W9_RECOVERY_DECISION_2026-11-14.md",
    import.meta.url,
  ),
  "utf8",
);

test("actual source plan declares all fifteen original and six L1 race rows", () => {
  for (let id = 1; id <= 15; id++) {
    assert.match(
      locks,
      new RegExp(`^\\| ${id} [^\\n]*\\|`, "m"),
      `missing core race ${id} in lock protocol`,
    );
  }
  for (let id = 16; id <= 21; id++) {
    assert.match(
      locks,
      new RegExp(`^\\| \\*\\*${id} [^\\n]*\\|`, "m"),
      `missing admission race ${id} in lock protocol`,
    );
  }
  assert.equal(RACE_CASES.length, 21);
});

test("source contract distinguishes fault branches and reverse HOLD timeout", () => {
  for (const token of [
    "pg_blocking_pids",
    "pg_locks",
    "COMMIT acknowledgment",
    "55P03",
    "40P01",
    "57014",
    "pgrowlocks",
    "rollback",
    "receipt",
    "READ COMMITTED",
    "ADMIT",
    "HOLD",
    "pre-COMMIT",
  ]) {
    assert.ok(locks.includes(token), `missing binding source token: ${token}`);
  }
  for (let id = 16; id <= 21; id++) {
    assert.match(
      defineTrial(id, "B-first", "T").expected,
      /A times out behind B/,
    );
  }
});

test("W9 migration113 denial cannot be mistaken for reviewed DDL success", () => {
  assert.match(
    decision,
    /BLOCKED — NO DATABASE RECOVERY AUTHORIZED OR EXECUTED/,
  );
  assert.match(decision, /second.*unfinished|second.*unresolved/is);
  assert.match(
    decision,
    /no permission to retry|no permission to|does not authorize a third/is,
  );
});
