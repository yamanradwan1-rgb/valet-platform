import { describe, expect, it } from "vitest";
import { projectTimelinePage } from "./timeline-projection";
import {
  auditId, dispatchId, event, keyId, MEMBER, page, SESSION, SLOT, TASK,
} from "./timeline-test-fixtures";

const instant = "2026-10-17T12:00:00.000Z";

describe("Issue300 four-source timeline projection", () => {
  it("preserves four distinct source records, stable rank and exact UTC", () => {
    const rows = [
      event("AUDIT", auditId, instant),
      event("KEY_CUSTODY", keyId, instant),
      event("DISPATCH", dispatchId, instant),
      event("INCIDENT", "00000000-0000-4000-8000-000000000004", instant),
    ];
    const view = projectTimelinePage(page(rows));
    expect(view.events).toHaveLength(4);
    expect(view.events.map((row) => row.source)).toEqual([
      "AUDIT", "KEY_CUSTODY", "DISPATCH", "INCIDENT",
    ]);
    expect(view.events.map((row) => row.occurredAt)).toEqual(Array(4).fill(instant));
    expect(view.events[1]!.isDiscoveryWitness).toBe(true);
    expect(view.events[0]!.isDiscoveryWitness).toBe(false);
    expect(view.allSourcesAvailable).toBe(true);
    expect(view.session.currentKeySlot.keySlotId).toBe(SLOT);
  });

  it("keeps ACTOR distinct from Dispatch previous/new assignees and current labels", () => {
    const dispatch = event("DISPATCH", dispatchId);
    dispatch.participants.push(
      { role: "PREVIOUS_ASSIGNEE", membership: { membershipId: MEMBER, currentDisplayName: null } },
      { role: "NEW_ASSIGNEE", membership: null },
    );
    dispatch.references.push({ kind: "TASK", id: TASK });
    const view = projectTimelinePage(page([dispatch]));
    expect(view.events[0]!.actor?.role).toBe("ACTOR");
    expect(view.events[0]!.actor?.nameBasis).toBe("CURRENT");
    expect(view.events[0]!.participants).toEqual([
      { role: "PREVIOUS_ASSIGNEE", membershipId: MEMBER, currentDisplayName: null, nameBasis: "UNAVAILABLE" },
      { role: "NEW_ASSIGNEE", membershipId: null, currentDisplayName: null, nameBasis: "UNAVAILABLE" },
    ]);
    expect(view.events[0]!.references).toContainEqual({ kind: "TASK", id: TASK });
  });

  it("keeps unknown/partial safe data minimal and does not invent actor or source detail", () => {
    const unknown = { ...event("AUDIT", auditId), kind: "UNKNOWN", quality: "UNVERIFIABLE" as const };
    const response = page([unknown], {
      coverage: {
        AUDIT: { status: "PARTIAL", reason: "INTEGRITY_ANOMALY" },
        KEY_CUSTODY: { status: "AVAILABLE" },
        DISPATCH: { status: "NOT_SUPPORTED", reason: "HISTORICAL_NOT_RECORDED" },
        INCIDENT: { status: "NOT_AUTHORIZED", reason: "DETAIL_RESTRICTED" },
      },
    });
    const view = projectTimelinePage(response);
    expect(view.events[0]!.actor).toBeNull();
    expect(view.events[0]!.references).toEqual([]);
    expect(view.events[0]!.participants).toEqual([]);
    expect(view.events[0]!.quality).toBe("UNVERIFIABLE");
    expect(view.allSourcesAvailable).toBe(false);
    expect(view.coverage.INCIDENT.status).toBe("NOT_AUTHORIZED");
    expect(JSON.stringify(view)).not.toContain("KEY_MISSING");
  });

  it("distinguishes before/in-window/after from server UTC context, not clock labels", () => {
    const rows = [
      event("AUDIT", auditId, "2026-10-17T11:59:59.999Z"),
      event("KEY_CUSTODY", keyId, "2026-10-17T12:00:00Z"),
      event("DISPATCH", dispatchId, "2026-10-17T13:00:00.000Z"),
    ];
    const view = projectTimelinePage(page(rows));
    expect(view.events.map((row) => row.discoveryPosition)).toEqual(["BEFORE", "IN_WINDOW", "AFTER"]);
    expect(view.events[1]!.isDiscoveryWitness).toBe(true);
    expect(projectTimelinePage(page(rows, { discoveryContext: undefined })).events
      .every((row) => row.discoveryPosition === "NOT_SUPPLIED")).toBe(true);
    expect(projectTimelinePage(page(rows, { discoveryContext: undefined })).events
      .every((row) => row.isDiscoveryWitness === null)).toBe(true);
  });

  it("fails closed on duplicate keys, out-of-order events and source outage", () => {
    expect(() => projectTimelinePage(page([event("AUDIT", auditId), event("AUDIT", auditId)])))
      .toThrow("INVALID_TIMELINE_ORDER");
    expect(() => projectTimelinePage(page([
      event("KEY_CUSTODY", keyId), event("AUDIT", auditId),
    ]))).toThrow("INVALID_TIMELINE_ORDER");
    const unavailable = page([event("AUDIT", auditId)]);
    expect(() => projectTimelinePage({
      ...unavailable,
      coverage: { ...unavailable.coverage, DISPATCH: { status: "UNAVAILABLE", reason: "SOURCE_UNAVAILABLE" } },
    })).toThrow("TIMELINE_SOURCE_UNAVAILABLE");
    expect(() => projectTimelinePage({
      ...unavailable,
      coverage: { ...unavailable.coverage, AUDIT: { status: "NOT_AUTHORIZED" } },
    })).toThrow("UNAUTHORIZED_OR_UNSUPPORTED_SOURCE_ROW");
  });

  it("rejects cross-purpose raw metadata and forged non-UUID references", () => {
    const row = event("AUDIT", auditId);
    const unsafeRow = { ...row, metadata: { token: "private" } };
    expect(() => projectTimelinePage(page([unsafeRow]))).toThrow();
    expect(() => projectTimelinePage(page([{
      ...row, references: [{ kind: "SESSION", id: "foreign" }],
    }]))).toThrow();
    expect(() => projectTimelinePage(page([row], {
      session: { ...page().session, sessionId: SESSION },
      order: "DESC" as "ASC",
    }))).toThrow();
  });
});
