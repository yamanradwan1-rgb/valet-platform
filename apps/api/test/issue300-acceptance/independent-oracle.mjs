// W7's synthetic reference truth is independent of the Investigation query.
// These are NOT production-domain-writer events or HTTP acceptance evidence.
const scopeA = { organizationId: "org-a", locationId: "location-a" };
const scopeOther = { organizationId: "org-other", locationId: "location-other" };

const event = (source, id, sessionId, time, fields = {}) => ({
  source, id, sessionId, time, ...fields,
});

export const referenceSessions = Object.freeze([
  {
    id: "session-a",
    ...scopeA,
    createdAt: "2026-10-23T07:00:00.000Z",
    currentSlot: "slot-c",
    currentPlate: "CURRENT-123",
    events: [
      event("AUDIT", "audit-1", "session-a", "2026-10-23T08:00:00.000Z", { type: "CHECK_IN_COMPLETED", actor: "staff-a" }),
      event("KEY_CUSTODY", "key-a", "session-a", "2026-10-23T09:05:00.000Z", { type: "SLOT_ASSIGNED", slot: "slot-a", actor: "staff-a" }),
      event("DISPATCH", "dispatch-a", "session-a", "2026-10-23T09:06:00.000Z", { type: "ASSIGNED", actor: "dispatcher", previousAssignee: "staff-b", newAssignee: "staff-c" }),
      event("KEY_CUSTODY", "key-b", "session-a", "2026-10-23T09:30:00.000Z", { type: "SLOT_CLEARED", slot: "slot-a", actor: "staff-c" }),
      event("KEY_CUSTODY", "key-c", "session-a", "2026-10-23T09:30:00.000Z", { type: "SLOT_ASSIGNED", slot: "slot-b", actor: "staff-c" }),
      event("DISPATCH", "dispatch-complete", "session-a", "2026-10-23T09:35:00.000Z", { type: "COMPLETED", actor: "staff-c", newAssignee: "staff-b" }),
      event("KEY_CUSTODY", "key-d", "session-a", "2026-10-23T09:40:00.000Z", { type: "SLOT_CLEARED", slot: "slot-b", actor: "staff-c" }),
      event("KEY_CUSTODY", "key-e", "session-a", "2026-10-23T09:41:00.000Z", { type: "SLOT_ASSIGNED", slot: "slot-c", actor: "staff-c" }),
      event("AUDIT", "audit-verified", "session-a", "2026-10-23T09:59:00.000Z", { type: "HANDOFF_VERIFIED", actor: "staff-a" }),
      event("AUDIT", "audit-release", "session-a", "2026-10-23T10:00:00.000Z", { type: "VEHICLE_RELEASED", actor: "staff-c" }),
      event("AUDIT", "audit-complete", "session-a", "2026-10-23T10:00:00.000Z", { type: "COMPLETED", actor: "staff-c" }),
    ],
  },
  {
    id: "session-b",
    ...scopeA,
    createdAt: "2026-10-23T06:00:00.000Z",
    currentSlot: "slot-a",
    currentPlate: "OTHER-222",
    events: [
      event("DISPATCH", "dispatch-queued", "session-b", "2026-10-23T09:07:00.000Z", { type: "QUEUED", actor: null }),
      event("KEY_CUSTODY", "key-other", "session-b", "2026-10-23T09:50:00.000Z", { type: "SLOT_ASSIGNED", slot: "slot-a", actor: "staff-d" }),
      event("INCIDENT", "incident-1", "session-b", "2026-10-23T10:05:00.000Z", { type: "INCIDENT_REPORTED", reporter: "staff-d", status: "OPEN" }),
      event("AUDIT", "audit-incident", "session-b", "2026-10-23T10:05:00.000Z", { type: "INCIDENT_OPENED", actor: "staff-d" }),
    ],
  },
  {
    id: "session-cross-tenant",
    ...scopeOther,
    createdAt: "2026-10-23T07:00:00.000Z",
    currentSlot: "slot-a",
    currentPlate: "SECRET-333",
    events: [
      event("KEY_CUSTODY", "secret-key", "session-cross-tenant", "2026-10-23T09:05:00.000Z", { type: "SLOT_ASSIGNED", slot: "slot-a", actor: "staff-foreign" }),
    ],
  },
]);

export const referenceSearch = Object.freeze({
  ...scopeA,
  from: "2026-10-23T09:00:00.000Z",
  to: "2026-10-23T09:10:00.000Z",
  slot: "slot-a",
  employee: "staff-c",
});

const eventKey = (e) => `${e.source}:${e.id}`;

// Reference query; do not reuse production query code or infer mutable state.
export function independentlyQualifyingSessions(sessions, query) {
  return sessions.flatMap((session) => {
    if (session.organizationId !== query.organizationId ||
        session.locationId !== query.locationId) return [];
    const window = session.events.filter((e) => e.time >= query.from && e.time < query.to);
    const slot = window.filter((e) => e.source === "KEY_CUSTODY" && e.slot === query.slot);
    const employee = window.filter((e) =>
      [e.actor, e.reporter, e.previousAssignee, e.newAssignee].includes(query.employee));
    if (query.slot && !slot.length || query.employee && !employee.length) return [];
    const qualified = new Set((query.slot || query.employee ? [...slot, ...employee] : window).map(eventKey));
    const witnesses = window.filter((e) => qualified.has(eventKey(e)));
    if (!witnesses.length) return [];
    return [{ sessionId: session.id, witnessKeys: witnesses.map(eventKey), count: witnesses.length,
      first: witnesses[0].time, last: witnesses.at(-1).time }];
  });
}

export function independentlyOrderedTimeline(session) {
  const rank = { AUDIT: 0, KEY_CUSTODY: 1, DISPATCH: 2, INCIDENT: 3 };
  return [...session.events].sort((a, b) =>
    a.time < b.time ? -1 : a.time > b.time ? 1 :
      rank[a.source] - rank[b.source] || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export const expectedSearch = Object.freeze([{
  sessionId: "session-a",
  witnessKeys: ["KEY_CUSTODY:key-a", "DISPATCH:dispatch-a"],
  count: 2,
  first: "2026-10-23T09:05:00.000Z",
  last: "2026-10-23T09:06:00.000Z",
}]);
