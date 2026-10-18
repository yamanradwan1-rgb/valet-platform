import { describe, expect, it, vi } from "vitest";
import type { DashboardApiClient } from "../../../../lib/api/dashboard-api-client";
import {
  readInvestigationEventDetail,
  readInvestigationTimeline,
} from "./timeline-api";
import { auditId, event, MEMBER, page, scope, SESSION } from "./timeline-test-fixtures";

describe("Issue300 typed read-only timeline transport", () => {
  it("issues one explicit signed continuation request without replay or changing the Session", async () => {
    const request = vi.fn(async (...args: Parameters<DashboardApiClient["request"]>) => {
      expect(args[0]).toContain("/timeline");
      return page();
    });
    const client = { request } as unknown as Pick<DashboardApiClient, "request">;
    const signal = new AbortController().signal;
    const reconciled = vi.fn();
    await readInvestigationTimeline(client, scope(), "signed_timeline_page", signal, reconciled);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0]![0]).toContain(`/sessions/${SESSION}/timeline`);
    expect(request.mock.calls[0]![2]).toMatchObject({
      query: { limit: 100, cursor: "signed_timeline_page" },
      signal, onAuthReconciled: reconciled,
    });
  });
  it("uses exact organization/Location/Session route, bounded query and AbortSignal", async () => {
    const request = vi.fn(async (...args: Parameters<DashboardApiClient["request"]>) => {
      expect(args[0]).toContain("audit-investigations");
      return page([event("AUDIT", auditId)]);
    });
    const client = { request } as unknown as Pick<DashboardApiClient, "request">;
    const abort = new AbortController();
    await readInvestigationTimeline(client, scope(), "opaque_cur_0001", abort.signal);
    expect(request).toHaveBeenCalledOnce();
    const [url, schema, options] = request.mock.calls[0]!;
    expect(url).toBe(
      "/v1/staff/management/organizations/11111111-1111-4111-8111-111111111111" +
      "/locations/22222222-2222-4222-8222-222222222222" +
      "/audit-investigations/sessions/33333333-3333-4333-8333-333333333333/timeline",
    );
    expect(options).toEqual({
      query: { limit: 100, cursor: "opaque_cur_0001" },
      signal: abort.signal,
    });
    expect(schema.safeParse(page()).success).toBe(true);
    expect(() => readInvestigationTimeline(
      client, scope({ sessionId: "../escape" }), null, abort.signal,
    )).toThrow();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("independently validates requested source/detail identity before showing anything", async () => {
    const detail = {
      source: "AUDIT" as const,
      key: { source: "AUDIT" as const, eventId: auditId },
      sessionId: SESSION,
      occurredAt: "2026-10-17T12:00:00.000Z",
      kind: "UNKNOWN",
      quality: "UNVERIFIABLE" as const,
      actor: { membershipId: MEMBER, currentDisplayName: null },
      participants: [],
      references: [],
      relatedEvidence: [],
    };
    const request = vi.fn(async (...args: Parameters<DashboardApiClient["request"]>) => {
      expect(args[0]).toContain("/events/");
      return detail;
    });
    const client = { request } as unknown as Pick<DashboardApiClient, "request">;
    const abort = new AbortController();
    const result = await readInvestigationEventDetail(client, scope(), "AUDIT", auditId, abort.signal);
    expect(result.kind).toBe("UNKNOWN");
    expect(request).toHaveBeenCalledOnce();
    expect(request.mock.calls[0]![0]).toContain("/events/AUDIT/" + auditId);
    await expect(readInvestigationEventDetail(client, scope(), "WRONG_TABLE", auditId, abort.signal))
      .rejects.toThrow();
    expect(request).toHaveBeenCalledOnce();
    request.mockResolvedValueOnce({
      ...detail,
      sessionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    });
    await expect(readInvestigationEventDetail(client, scope(), "AUDIT", auditId, abort.signal))
      .rejects.toThrow("INVALID_INVESTIGATION_DETAIL_IDENTITY");
  });

  it("does not allow unknown fields/secret-bearing metadata through strict detail parsing", async () => {
    const invalid = {
      source: "AUDIT",
      key: { source: "AUDIT", eventId: auditId },
      sessionId: SESSION,
      occurredAt: "2026-10-17T12:00:00Z",
      kind: "UNKNOWN",
      quality: "RECORDED",
      actor: null,
      participants: [],
      references: [],
      relatedEvidence: [],
      rawMetadata: { token: "private" },
    };
    // The real DashboardApiClient applies this same strict schema to HTTP.
    const client = {
      request: vi.fn(async (_, schema) => schema.parse(invalid)),
    } as unknown as Pick<DashboardApiClient, "request">;
    await expect(readInvestigationEventDetail(
      client, scope(), "AUDIT", auditId, new AbortController().signal,
    )).rejects.toThrow();
  });
});
