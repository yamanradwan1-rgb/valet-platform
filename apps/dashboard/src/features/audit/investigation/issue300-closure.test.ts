import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { appendInvestigationSessions, initialInvestigationPage,
  nextInvestigationPageState } from "./live/investigation-pagination-state";
import { investigationFailure, investigationFailureText,
  reconcileInvestigationAuthorization } from "../investigation-live-support";
import { DashboardApiError } from "../../../lib/api/dashboard-api-error";
import { InvestigationWorkspace } from "../investigation-workspace";
import { investigationMinuteCandidates, investigationMinuteToUtc } from "../investigation-live-timezone";
import { buildLiveInvestigationQuery, createLiveInvestigationDraft } from "../investigation-live-query";
import type { DemoMatch } from "../investigation-demo-types";
import { readInvestigationSessions } from "./search/investigation-search-client";
import type { DashboardApiClient } from "../../../lib/api/dashboard-api-client";

const SESSION = "00000000-0000-4000-8000-000000000001";
const LOC = "00000000-0000-4000-8000-000000000002";
const row = (id: string) => ({ session: { id } }) as DemoMatch;
const available = { AUDIT: { status: "AVAILABLE" as const },
  KEY_CUSTODY: { status: "AVAILABLE" as const },
  DISPATCH: { status: "AVAILABLE" as const },
  INCIDENT: { status: "AVAILABLE" as const } };
const partial = { ...available,
  AUDIT: { status: "PARTIAL" as const, reason: "INTEGRITY_ANOMALY" as const } };

describe("Issue300 UI-M1 pagination and error contract", () => {
  it("appends unique IDs without replacing an existing selected row", () => {
    const original = row(SESSION);
    const next = row("00000000-0000-4000-8000-000000000003");
    expect(appendInvestigationSessions([original], [row(SESSION), next]))
      .toEqual([original, next]);
    const state = nextInvestigationPageState(initialInvestigationPage,
      { snapshotAt: "2026-10-18T10:00:00Z", nextCursor: "signed_cursor",
        coverage: available }, 2);
    expect(state.nextCursor).toBe("signed_cursor");
    expect(state.added).toBe(2);
    expect(nextInvestigationPageState(state,
      { snapshotAt: state.snapshotAt!, nextCursor: null,
        coverage: partial }, 1)).toMatchObject({ nextCursor: null,
      coverageVaries: true, coverage: available });
    expect(() => nextInvestigationPageState(state,
      { snapshotAt: "2026-10-18T10:00:01Z", nextCursor: null,
        coverage: partial }, 1))
      .toThrow("INVESTIGATION_SEARCH_SNAPSHOT_CHANGED");
  });
  it.each(["en", "ar"] as const)("preserves Location-only anomaly with zero Sessions in %s", (locale) => {
    const state = nextInvestigationPageState(initialInvestigationPage,
      { snapshotAt: "2026-10-18T10:00:00Z", nextCursor: null,
        coverage: partial }, 0);
    const query = { ...createLiveInvestigationDraft(LOC),
      date: "2026-10-18", start: "08:00", end: "09:00" };
    const html = renderToStaticMarkup(createElement(InvestigationWorkspace, {
      locale, matches: [], selectedId: null, onSelect: () => {}, onEvent: () => {},
      query, searchPage: state,
    }));
    expect(html).toContain('data-investigation-coverage="limited"');
    expect(html).toContain("AUDIT: PARTIAL (INTEGRITY_ANOMALY)");
    expect(html).toContain(locale === "ar" ? "تغطية مصادر البحث" : "Search source coverage");
    expect(html).toContain(locale === "ar" ? "تغطية المصادر محدودة" : "source coverage is limited");
    expect(html).not.toContain(locale === "ar" ? "لا توجد جلسات مطابقة" : "No matching Sessions");
    const normal = renderToStaticMarkup(createElement(InvestigationWorkspace, {
      locale, matches: [], selectedId: null, onSelect: () => {}, onEvent: () => {},
      query, searchPage: { ...state, coverage: available },
    }));
    expect(normal).not.toContain("data-investigation-coverage");
  });
  it("passes the frozen UTC query and signed cursor unchanged in exactly one manual continuation request", async () => {
    const draft = { ...createLiveInvestigationDraft(LOC),
      date: "2026-10-18", start: "01:00", end: "02:00" };
    const query = buildLiveInvestigationQuery(draft, LOC, {});
    const requested = vi.fn(async (...args: Parameters<DashboardApiClient["request"]>) => {
      expect(args[0]).toContain("/audit-investigations/sessions");
      return { items: [], nextCursor: null,
        snapshotAt: "2026-10-18T03:00:00.000Z", semanticsVersion: 1,
        coverage: { AUDIT: { status: "AVAILABLE" }, KEY_CUSTODY: { status: "AVAILABLE" },
          DISPATCH: { status: "AVAILABLE" }, INCIDENT: { status: "AVAILABLE" } },
      };
    });
    const transport = {
      api: { request: requested } as never,
      scope: { organizationId: LOC, locationId: LOC,
        role: "LOCATION_MANAGER" as const, identityGeneration: 1,
        sessionGeneration: 2, selectionRevision: 3 },
      signal: new AbortController().signal, onAuthReconciled: vi.fn(),
    };
    const cursor = "signed_page_from_previous_read";
    await readInvestigationSessions(transport, { ...query, cursor });
    expect(requested).toHaveBeenCalledTimes(1);
    expect(requested.mock.calls[0]![2]).toMatchObject({
      method: "GET", query: { ...query, cursor }, signal: transport.signal,
    });
    expect(query.limit).toBe(100);
  });
  it("classifies invalidation separately from transient error and authorization", () => {
    const error = (status: number, code: string) =>
      new DashboardApiError({ kind: status === 403 ? "authorization" : "conflict",
        message: "private backend text must not render", status, code });
    expect(investigationFailure(error(409, "CURSOR_INVALIDATED"))).toBe("restart");
    expect(investigationFailure(error(403, "FORBIDDEN"))).toBe("auth");
    expect(investigationFailure(new Error("network failure"))).toBe("transient");
    expect(investigationFailureText("en", "restart")).not.toContain("private backend");
    expect(investigationFailureText("ar", "source")).toContain("الأدلة");
  });
  it("revokes all protected Investigation state for selector 401/403/MFA but not 503", () => {
    const revoke = vi.fn();
    for (const [status, kind] of [[401, "auth"], [403, "authorization"],
      [403, "mfa"]] as const) {
      expect(reconcileInvestigationAuthorization(new DashboardApiError({
        kind, status, code: "AUTH_DENIED", message: "private message",
      }), revoke)).toBe(true);
    }
    expect(revoke).toHaveBeenCalledTimes(3);
    expect(reconcileInvestigationAuthorization(new DashboardApiError({
      kind: "unknown", status: 503, code: "SOURCE_UNAVAILABLE", message: "temporary",
    }), revoke)).toBe(false);
    expect(revoke).toHaveBeenCalledTimes(3);
  });
  it("requires deliberate first/second UTC choice at a DST fold, and rejects a gap", () => {
    const candidates = investigationMinuteCandidates("2026-11-01", "01:30", "America/New_York");
    expect(candidates).toEqual([
      { utc: "2026-11-01T05:30:00.000Z", offset: "UTC-04:00" },
      { utc: "2026-11-01T06:30:00.000Z", offset: "UTC-05:00" },
    ]);
    const draft = { ...createLiveInvestigationDraft(LOC),
      date: "2026-11-01", start: "01:40", end: "01:20",
      fromUtc: "2026-11-01T05:40:00.000Z", toUtc: "2026-11-01T06:20:00.000Z" };
    expect(buildLiveInvestigationQuery(draft, LOC, {}, "America/New_York"))
      .toMatchObject({ from: draft.fromUtc, to: draft.toUtc, limit: 100 });
    expect(() => investigationMinuteToUtc("2026-11-01", "01:30", "America/New_York"))
      .toThrow("AMBIGUOUS_LOCAL_TIME_REQUIRES_OFFSET");
    expect(() => investigationMinuteToUtc("2026-03-08", "02:30", "America/New_York"))
      .toThrow("NONEXISTENT_LOCAL_TIME");
  });
});
