import assert from "node:assert/strict";
import { test } from "node:test";
import { assertDistinctStaffSessions } from "./issue300-w13-session-matrix.mjs";

const users = Object.fromEntries(
  ["ca", "lm", "supervisor", "foreign"].map((role, index) =>
    [role, { sessionId: `0000000${index + 1}-1111-4111-8111-00000000000${index + 1}` }]),
);

test("all four legitimate Staff sessions are distinct, including supervisor", () => {
  assert.equal(assertDistinctStaffSessions(users), true);
});

test("reusing the CA session as supervisor cannot silently pass", () => {
  assert.throws(() => assertDistinctStaffSessions({
    ...users, supervisor: { sessionId: users.ca.sessionId },
  }), /FOUR_DISTINCT/);
});

test("missing/invalid supervisor or foreign session fails closed", () => {
  for (const role of ["supervisor", "foreign"]) {
    assert.throws(() => assertDistinctStaffSessions({
      ...users, [role]: { sessionId: null },
    }), /REAL_SESSION_REQUIRED/);
    assert.throws(() => assertDistinctStaffSessions({
      ...users, [role]: { sessionId: "not-a-uuid" },
    }), /REAL_SESSION_REQUIRED/);
  }
});
