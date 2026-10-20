import { describe, expect, it, vi } from "vitest";
import type { DashboardApiClient } from "../../../../lib/api/dashboard-api-client";
import { DashboardApiError } from "../../../../lib/api/dashboard-api-error";
import { readInvestigationEventDetail, readInvestigationTimeline } from "./timeline-api";
import { InvestigationTimelineState } from "./timeline-state";
import { auditId, event, keyId, page, scope, SESSION, SNAPSHOT } from "./timeline-test-fixtures";

const api = { request: vi.fn() } as unknown as Pick<DashboardApiClient, "request">;
const cursor = "next_page_0001";
const later = event("KEY_CUSTODY", keyId, "2026-10-17T12:01:00.000Z");
const first = page([event("AUDIT", auditId)], { nextCursor: cursor });

describe("Issue300 timeline request lifecycle and snapshot safety", () => {
  it("appends only the next valid keyset page of the same snapshot", async () => {
    const reader: typeof readInvestigationTimeline = vi.fn(async (_, __, value) =>
      value === null ? first : page([later]));
    const machine = new InvestigationTimelineState(api, reader);
    await machine.start(scope());
    expect(machine.state.status).toBe("READY");
    expect(machine.state.events).toHaveLength(1);
    expect(machine.state.nextCursor).toBe(cursor);
    await machine.next();
    expect(machine.state.events.map((row) => row.source)).toEqual(["AUDIT", "KEY_CUSTODY"]);
    expect(machine.state.snapshotAt).toBe(SNAPSHOT);
    expect(machine.state.pageExhausted).toBe(true);
    await machine.next();
    expect(reader).toHaveBeenCalledTimes(2);
  });

  it("cancels and fences late results on exact Location/session-generation changes", async () => {
    let resolve!: (value: ReturnType<typeof page>) => void;
    const reader: typeof readInvestigationTimeline = vi.fn(
      (...args: Parameters<typeof readInvestigationTimeline>) => {
        expect(args[3]).toBeInstanceOf(AbortSignal);
        return new Promise<Awaited<ReturnType<typeof readInvestigationTimeline>>>(
          (done) => { resolve = done; });
      },
    );
    const machine = new InvestigationTimelineState(api, reader);
    const pending = machine.start(scope());
    const oldSignal = vi.mocked(reader).mock.calls[0]![3];
    machine.switchScope(scope({ locationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }));
    expect(oldSignal.aborted).toBe(true);
    resolve(first);
    await pending;
    expect(machine.state.events).toEqual([]);
    expect(machine.state.status).toBe("IDLE");
    const pending2 = machine.start(scope({ sessionGeneration: 4 }));
    machine.dispose();
    resolve(page([event("AUDIT", auditId)]));
    await pending2;
    expect(machine.state.identity).toBeNull();
    expect(machine.state.events).toHaveLength(0);
  });

  it("invalidates A→B→A without resurrecting prior Session history", async () => {
    const reader: typeof readInvestigationTimeline = async () => first;
    const machine = new InvestigationTimelineState(api, reader);
    await machine.start(scope());
    expect(machine.state.events).toHaveLength(1);
    machine.switchScope(scope({ sessionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }));
    machine.switchScope(scope({ selectionRevision: 2 }));
    expect(machine.state.events).toEqual([]);
    expect(machine.state.snapshotAt).toBeNull();
  });

  it("rejects late page with changed snapshot or duplicate source key", async () => {
    const cases = [
      page([later], { snapshotAt: "2026-10-17T19:01:00Z" }),
      page([event("AUDIT", auditId)]),
      page([later], { nextCursor: cursor }),
      page([later], { discoveryContext: undefined }),
    ];
    for (const second of cases) {
      const reader: typeof readInvestigationTimeline = async (_, __, value) =>
        value ? second : first;
      const machine = new InvestigationTimelineState(api, reader);
      await machine.start(scope());
      await machine.next();
      expect(machine.state.status).toBe("ERROR");
      expect(machine.state.events).toEqual([]);
      expect(machine.state.error).toBe("MALFORMED_RESPONSE");
    }
  });

  it("keeps completed earlier pages but never marks a failed page complete", async () => {
    let fail = true;
    const reader: typeof readInvestigationTimeline = async (_, __, value) => {
      if (value === null) return first;
      if (fail) throw new DashboardApiError({ kind: "network", message: "disconnected" });
      return page([later]);
    };
    const machine = new InvestigationTimelineState(api, reader);
    await machine.start(scope());
    await machine.next();
    expect(machine.state.status).toBe("ERROR");
    expect(machine.state.error).toBe("NETWORK");
    expect(machine.state.pageExhausted).toBe(false);
    expect(machine.state.events).toHaveLength(1);
    fail = false;
    await machine.retry();
    expect(machine.state.events).toHaveLength(2);
    expect(machine.state.status).toBe("READY");
  });

  it.each([
    ["authorization", "DENIED", "ACCESS_REVOKED"],
    ["mfa", "DENIED", "ACCESS_REVOKED"],
    ["entitlement", "DENIED", "ACCESS_REVOKED"],
    ["validation", "EXPIRED", "CURSOR_EXPIRED"],
  ] as const)("clears data for %s revocation or cursor failure", async (kind, status, failure) => {
    const reader: typeof readInvestigationTimeline = async (_, __, value) => {
      if (!value) return first;
      throw new DashboardApiError({
        kind,
        code: kind === "validation" ? "INVESTIGATION_CURSOR_EXPIRED" : "AUTHORIZATION_DENIED",
        message: "private API detail",
      });
    };
    const machine = new InvestigationTimelineState(api, reader);
    await machine.start(scope());
    await machine.next();
    expect(machine.state.status).toBe(status);
    expect(machine.state.error).toBe(failure);
    expect(machine.state.events).toEqual([]);
    expect(machine.state.session).toBeNull();
    await machine.retry();
    expect(machine.state.events).toEqual([]);
  });

  it("fails closed when server returns a different Session or unavailable source", async () => {
    const malformed = page([event("AUDIT", auditId)], {
      session: { ...page().session, sessionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
    });
    const unavailable = page([event("AUDIT", auditId)], {
      coverage: { ...page().coverage, INCIDENT: { status: "UNAVAILABLE", reason: "SOURCE_UNAVAILABLE" } },
    });
    for (const response of [malformed, unavailable]) {
      const machine = new InvestigationTimelineState(api, async () => response);
      await machine.start(scope({ sessionId: SESSION }));
      expect(machine.state.events).toEqual([]);
      expect(machine.state.status).toBe("ERROR");
    }
  });

  it("opens only events already in this authorized page and fences late detail responses", async () => {
    const response = page([event("AUDIT", auditId)]);
    const readPage: typeof readInvestigationTimeline = async () => response;
    let resolve!: (value: Awaited<ReturnType<typeof readInvestigationEventDetail>>) => void;
    const readDetail: typeof readInvestigationEventDetail = vi.fn(
      (...args: Parameters<typeof readInvestigationEventDetail>) => {
        expect(args[3]).toBe(auditId);
        return new Promise<Awaited<ReturnType<typeof readInvestigationEventDetail>>>(
          (done) => { resolve = done; });
      },
    );
    const machine = new InvestigationTimelineState(api, readPage, readDetail);
    await machine.start(scope());
    await machine.openDetail("AUDIT", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    expect(readDetail).not.toHaveBeenCalled();
    const pending = machine.openDetail("AUDIT", auditId);
    expect(machine.state.detailStatus).toBe("LOADING");
    const signal = vi.mocked(readDetail).mock.calls[0]![4];
    machine.switchScope(scope({ sessionGeneration: 8 }));
    expect(signal.aborted).toBe(true);
    resolve({
      source: "AUDIT", key: { source: "AUDIT", eventId: auditId },
      sessionId: SESSION, occurredAt: "2026-10-17T12:00:00.000Z",
      kind: "UNKNOWN", quality: "RECORDED", actor: null,
      participants: [], references: [], relatedEvidence: [],
    });
    await pending;
    expect(machine.state.detail).toBeNull();
    expect(machine.state.events).toEqual([]);
  });

  it("clears protected timeline immediately if point-detail authority is revoked", async () => {
    const readPage: typeof readInvestigationTimeline = async () =>
      page([event("AUDIT", auditId)]);
    const denied: typeof readInvestigationEventDetail = async () => {
      throw new DashboardApiError({ kind: "authorization", message: "denied" });
    };
    const machine = new InvestigationTimelineState(api, readPage, denied);
    await machine.start(scope());
    await machine.openDetail("AUDIT", auditId);
    expect(machine.state.status).toBe("DENIED");
    expect(machine.state.events).toEqual([]);
    expect(machine.state.detail).toBeNull();
  });
});
