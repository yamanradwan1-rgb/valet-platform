// Independent exact-session invariant for four genuine Staff identities.
import assert from "node:assert/strict";

const roles = Object.freeze(["ca", "lm", "supervisor", "foreign"]);
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export function assertDistinctStaffSessions(users) {
  assert(users && typeof users === "object", "W13_STAFF_MATRIX_MISSING");
  const sessions = roles.map(role => {
    const sessionId = users[role]?.sessionId;
    assert.match(sessionId ?? "", uuid,
      `W13_${role.toUpperCase()}_REAL_SESSION_REQUIRED`);
    return sessionId.toLowerCase();
  });
  assert.equal(new Set(sessions).size, roles.length,
    "W13_FOUR_DISTINCT_CURRENT_STAFF_SESSIONS_REQUIRED");
  return true;
}
