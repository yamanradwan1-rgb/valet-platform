import assert from "node:assert/strict";

// Called ONLY after a real task-owned G2 Check-in→A→B→C→PARKED HTTP chain.
// Every lifecycle state transition is an authenticated domain HTTP command;
// direct PostgreSQL reads below are oracle observations, never state writers.
function requireOk(step, response) {
  assert.equal(response.status, 200,
    step + " HTTP " + response.status + " (" +
    String(response.json?.code ?? response.json?.error?.code ?? "unspecified") +
    ")");
  return response.json;
}

export async function proveIssue300RetrievalHandoff(input) {
  const { db, post, read, users, sessionId, token, adminToken,
    slot, parkedVersion, history } = input;
  const base = "/v1/staff/valet-sessions/" + sessionId;

  const guest = requireOk("Guest access real staff issue",
    await post("/v1/staff/check-in/sessions/" + sessionId +
      "/guest-access/issue", token, { intent: "ISSUE_OR_ROTATE" }));
  const guestToken = guest.rawToken;
  assert.match(guestToken, /^[A-Za-z0-9_-]{43}$/);
  // Guest bearer is never stored, logged or mixed with a browser cookie.
  requireOk("Guest retrieval request",
    await post("/v1/guest/session/request-retrieval", guestToken, {}));

  const [requested] = (await db.query(
    "SELECT state::text AS state,version FROM valet_sessions WHERE id=$1",
    [sessionId])).rows;
  assert.equal(requested.state, "REQUESTED");
  assert.ok(requested.version > parkedVersion);
  const retrieval = (await db.query(
    `SELECT id,status::text AS status,version FROM tasks
     WHERE valet_session_id=$1 AND task_type='RETRIEVAL'`,
    [sessionId])).rows;
  assert.equal(retrieval.length, 1);
  assert.equal(retrieval[0].status, "QUEUED");
  const taskId = retrieval[0].id;
  const queued = (await db.query(
    `SELECT id,actor_membership_id AS actor,
       pagination_birth_xid::text AS birth
     FROM dispatch_events WHERE valet_session_id=$1
       AND task_id=$2 AND event_type='QUEUED'`,
    [sessionId, taskId])).rows;
  assert.equal(queued.length, 1);
  assert.equal(queued[0].actor, null);
  assert.ok(queued[0].birth);
  globalThis.console.log("PASS T01 real Guest retrieval request: " +
    "REQUESTED + queued retrieval Task and null-actor born-XID Dispatch");

  const assigned = requireOk("Assign retrieval",
    await post("/v1/staff/tasks/" + taskId + "/assign", token, {
      expectedVersion: retrieval[0].version,
      targetAssigneeMembershipId: users.supervisor.membershipId,
    }));
  assert.equal(assigned.status, "ASSIGNED");
  const accepted = requireOk("Accept retrieval",
    await post("/v1/staff/tasks/" + taskId + "/accept", token, {
      expectedVersion: assigned.version,
    }));
  assert.equal(accepted.status, "ACCEPTED");
  const started = requireOk("Start retrieval",
    await post(base + "/start-retrieval", token, {
      expectedSessionVersion: requested.version,
      expectedTaskVersion: accepted.version,
      keySlotCode: slot.code,
      keySlotId: slot.id,
    }));
  assert.equal(started.state, "RETRIEVING");
  const checkout = (await db.query(
    `SELECT id,key_slot_id AS slot,
       actor_membership_id AS actor,pagination_birth_xid::text AS birth
     FROM key_custody_events WHERE valet_session_id=$1
       AND event_type='CHECKED_OUT' AND occurred_at=$2::timestamptz`,
    [sessionId, started.retrievalStartedAt],
  )).rows;
  assert.equal(checkout.length, 1);
  assert.equal(checkout[0].slot, slot.id);
  assert.equal(checkout[0].actor, users.supervisor.membershipId);
  assert.ok(checkout[0].birth);
  const checkoutHistory = (await db.query(
    `SELECT id,pagination_birth_xid::text AS birth
     FROM key_custody_events WHERE valet_session_id=$1
       AND event_type='CHECKED_OUT'`, [sessionId],
  )).rows;
  assert.equal(checkoutHistory.length, 2,
    "Parking and Retrieval must retain separate real checkout evidence");
  assert.ok(checkoutHistory.every((row) => row.birth));

  const ready = requireOk("Mark ready",
    await post(base + "/mark-ready", token, {
      expectedSessionVersion: started.sessionVersion,
    }));
  assert.equal(ready.state, "READY");
  const pending = requireOk("Initiate handoff",
    await post(base + "/initiate-handoff", token, {
      expectedSessionVersion: ready.sessionVersion,
    }));
  assert.equal(pending.state, "HANDOFF_PENDING");
  const verification = requireOk("Guest pickup code issue",
    await post("/v1/guest/session/handoff-verification/issue",
      guestToken, { method: "PICKUP_CODE" }));
  assert.equal(verification.method, "PICKUP_CODE");
  assert.match(verification.pickupCode, /^\d{4}$/);
  const verified = requireOk("Verify pickup code",
    await post(base + "/verify-pickup-code", token, {
      expectedSessionVersion: pending.sessionVersion,
      pickupCode: verification.pickupCode,
    }));
  assert.equal(verified.verificationStatus, "VERIFIED");
  const completed = requireOk("Complete handoff / financial guard",
    await post(base + "/complete-handoff", token, {
      expectedSessionVersion: verified.sessionVersion,
    }));
  assert.equal(completed.state, "COMPLETED");
  assert.equal(completed.taskStatus, "COMPLETED");
  assert.equal(completed.retrievalRequestStatus, "COMPLETED");

  const release = (await db.query(
    `SELECT id,key_slot_id AS slot,
       actor_membership_id AS actor,pagination_birth_xid::text AS birth
     FROM key_custody_events WHERE valet_session_id=$1
       AND event_type='RELEASED'`, [sessionId],
  )).rows;
  assert.equal(release.length, 1);
  assert.equal(release[0].slot, slot.id);
  assert.equal(release[0].actor, users.supervisor.membershipId);
  assert.ok(release[0].birth);
  const dispatch = (await db.query(
    `SELECT id,pagination_birth_xid::text AS birth FROM dispatch_events
     WHERE valet_session_id=$1 AND task_id=$2 AND event_type='COMPLETED'`,
    [sessionId, taskId],
  )).rows;
  assert.equal(dispatch.length, 1);
  assert.ok(dispatch[0].birth);
  const persisted = (await db.query(
    `SELECT s.state::text AS state,s.key_slot_id AS slot,
       s.completed_by_membership_id AS completer,t.status::text AS task_status,
       r.status::text AS request_status
     FROM valet_sessions s
     JOIN tasks t ON t.valet_session_id=s.id AND t.task_type='RETRIEVAL'
     JOIN retrieval_requests r ON r.valet_session_id=s.id
     WHERE s.id=$1 AND t.id=$2`, [sessionId, taskId],
  )).rows;
  assert.equal(persisted.length, 1);
  assert.equal(persisted[0].state, "COMPLETED");
  assert.equal(persisted[0].slot, null);
  assert.equal(persisted[0].completer, users.supervisor.membershipId);
  assert.equal(persisted[0].task_status, "COMPLETED");
  assert.equal(persisted[0].request_status, "COMPLETED");
  const verificationRows = (await db.query(
    `SELECT method::text AS method,verified_at,consumed_at
     FROM handoff_verifications WHERE valet_session_id=$1`,
    [sessionId],
  )).rows;
  assert.equal(verificationRows.length, 1);
  assert.equal(verificationRows[0].method, "PICKUP_CODE");
  assert.ok(verificationRows[0].verified_at && verificationRows[0].consumed_at);
  // Never select verification hashes or guest material into diagnostics.
  const expectedAuditTypes = [
    "RETRIEVAL_REQUESTED", "VALET_SESSION_RETRIEVAL_STARTED",
    "VALET_SESSION_HANDOFF_INITIATED", "HANDOFF_VERIFICATION_ISSUED",
    "HANDOFF_VERIFIED", "VALET_SESSION_VEHICLE_RELEASED",
    "VALET_SESSION_COMPLETED",
  ];
  const auditFacts = (await db.query(
    `SELECT id,event_type::text AS type,occurred_at AS occurred,
       pagination_birth_xid::text AS birth
     FROM audit_events WHERE valet_session_id=$1
       AND event_type::text=ANY($2::text[])`,
    [sessionId, expectedAuditTypes],
  )).rows;
  assert.equal(auditFacts.length, expectedAuditTypes.length);
  assert.deepEqual(auditFacts.map((row) => row.type).sort(),
    [...expectedAuditTypes].sort());
  assert.ok(auditFacts.every((row) => row.birth));
  const vehicleReleased = auditFacts.find((row) =>
    row.type === "VALET_SESSION_VEHICLE_RELEASED");
  const sessionCompleted = auditFacts.find((row) =>
    row.type === "VALET_SESSION_COMPLETED");
  assert.ok(vehicleReleased && sessionCompleted);
  assert.notEqual(vehicleReleased.id, sessionCompleted.id);
  assert.equal(vehicleReleased.occurred.valueOf(),
    sessionCompleted.occurred.valueOf(),
    "Vehicle release and Session completion are separate same-time facts");
  const historyRead = requireOk("CA MFA final Timeline",
    await read(history + "/sessions/" + sessionId +
      "/timeline?limit=100", adminToken));
  const keys = new Set(historyRead.items.map((item) =>
    item.key.source + ":" + item.key.eventId));
  for (const [source, event] of [
    ...checkoutHistory.map((row) => ["KEY_CUSTODY", row]),
    ["KEY_CUSTODY", release[0]],
    ["DISPATCH", dispatch[0]],
    ...auditFacts.map((row) => ["AUDIT", row]),
  ]) assert.ok(keys.has(source + ":" + event.id),
    "Missing independently persisted final " + source + " event");
  globalThis.console.log("PASS T01 G2 real Retrieval→READY→guest " +
    "verified handoff→COMPLETE: source-born CHECKED_OUT, RELEASED, " +
    "Dispatch COMPLETED, exact CA/MFA Timeline historical readback");
}
