import test from "node:test";
import assert from "node:assert/strict";
import {
  expectedSearch, independentlyOrderedTimeline, independentlyQualifyingSessions,
  referenceSearch, referenceSessions,
} from "./independent-oracle.mjs";

const a = referenceSessions[0];
const b = referenceSessions[1];

test("T01/T30: same Session AND uses separate in-window historical witnesses", () => {
  assert.deepEqual(independentlyQualifyingSessions(referenceSessions, referenceSearch), expectedSearch);
  assert.equal(a.currentSlot, "slot-c"); // Not the matched historical slot.
});

test("T02/T37: reused current slot and session creation are not witnesses", () => {
  assert.deepEqual(independentlyQualifyingSessions(referenceSessions, {
    ...referenceSearch, employee: "",
  }).map((r) => r.sessionId), ["session-a"]);
  assert.ok(b.createdAt < referenceSearch.from);
  assert.equal(b.currentSlot, "slot-a");
});

test("T06/T07: QUEUED Dispatch is independently present with nullable actor", () => {
  const timeline = independentlyOrderedTimeline(b);
  assert.equal(timeline[0].id, "dispatch-queued");
  assert.equal(timeline[0].actor, null);
});

test("T03/T08/T10: reassignment actor, participants, same-time slot rows separate", () => {
  const dispatch = a.events.find((e) => e.id === "dispatch-a");
  assert.equal(dispatch.actor, "dispatcher");
  assert.equal(dispatch.previousAssignee, "staff-b");
  assert.equal(dispatch.newAssignee, "staff-c");
  assert.notEqual(dispatch.actor, dispatch.newAssignee);
  const pair = a.events.filter((e) => e.time === "2026-10-23T09:30:00.000Z");
  assert.deepEqual(pair.map((e) => e.type), ["SLOT_CLEARED", "SLOT_ASSIGNED"]);
  const completed = a.events.find((e) => e.id === "dispatch-complete");
  assert.equal(completed.actor, "staff-c");
  assert.equal(completed.newAssignee, "staff-b");
});

test("T01/T17: A→B→C custody and verified handoff do not imply holder or release", () => {
  assert.deepEqual(a.events.filter((e) => e.type === "SLOT_ASSIGNED").map((e) => e.slot),
    ["slot-a", "slot-b", "slot-c"]);
  assert.equal(a.currentSlot, "slot-c");
  const verified = a.events.find((e) => e.type === "HANDOFF_VERIFIED");
  assert.ok(verified.time < a.events.find((e) => e.type === "VEHICLE_RELEASED").time);
  assert.equal(verified.actor, "staff-a");
});

test("T30/T31: same-Session filter AND cannot join staff from a foreign Session", () => {
  assert.deepEqual(independentlyQualifyingSessions(referenceSessions, {
    ...referenceSearch, employee: "staff-d",
  }), []);
});

test("T17/T18/T39: equal-time persisted RELEASED and COMPLETED both survive", () => {
  const atRelease = independentlyOrderedTimeline(a)
    .filter((e) => e.time === "2026-10-23T10:00:00.000Z");
  assert.deepEqual(atRelease.map((e) => e.id), ["audit-complete", "audit-release"]);
});

test("T21/T38: Incident and paired Audit distinct; full timeline exceeds search interval", () => {
  const timeline = independentlyOrderedTimeline(b);
  assert.deepEqual(timeline.slice(-2).map((e) => e.source), ["AUDIT", "INCIDENT"]);
  assert.equal(timeline.filter((e) => e.source === "INCIDENT").length, 1);
  assert.equal(timeline.some((e) => e.time >= referenceSearch.to), true);
});

test("T35: half-open exact millisecond endpoint excludes to, includes from", () => {
  const from = "2026-10-23T09:05:00.000Z";
  const to = "2026-10-23T09:06:00.000Z";
  assert.deepEqual(independentlyQualifyingSessions(referenceSessions, {
    ...referenceSearch, from, to, employee: "",
  })[0].witnessKeys, ["KEY_CUSTODY:key-a"]);
});

test("T48 reference: cross-tenant Session never returned despite matching slot/time", () => {
  const matches = independentlyQualifyingSessions(referenceSessions, {
    ...referenceSearch, employee: "",
  });
  assert.equal(matches.some((r) => r.sessionId === "session-cross-tenant"), false);
});
