import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { AuditInvestigationSearchResponse } from "@valet/contracts";

import { InvestigationWorkspace } from "../../investigation-workspace";
import { DEFAULT_INVESTIGATION_QUERY } from "../../investigation-demo-types";
import { readInvestigationTimeline } from "./timeline-api";
import {
  attachInvestigationLiveDetail,
  attachInvestigationLiveTimeline,
  investigationLocalTime,
  mapInvestigationLiveSearch,
} from "./investigation-live-projection";
import { auditId, event, keyId, page, scope, SESSION } from "./timeline-test-fixtures";

const current = (value: string | null) => ({
  value, basis: "CURRENT" as const, unavailable: value === null,
});

function search(): AuditInvestigationSearchResponse {
  return {
    items: [{
      sessionId: SESSION,
      currentVehicle: {
        make: current("Hyundai"), model: current("Tucson"),
        plate: current(null), plateCountry: current(null),
        temporaryDescriptor: current(null),
      },
      currentKeySlot: { keySlotId: null, code: current(null) },
      currentState: "PARKED",
      currentStateBasis: "CURRENT",
      firstMatchedAt: "2026-10-17T11:00:00Z",
      lastMatchedAt: "2026-10-17T12:00:00Z",
      matchingRecordCount: 2,
      matchReasons: [
        { source: "AUDIT", eventId: auditId, matchedBy: "WINDOW" },
        { source: "KEY_CUSTODY", eventId: keyId, matchedBy: "WINDOW" },
      ],
      hasVisibleIncident: true,
      matchedIncidentCount: 0,
      coverage: page().coverage,
    }],
    nextCursor: null,
    snapshotAt: "2026-10-17T19:00:00Z",
    semanticsVersion: 1,
    coverage: page().coverage,
  };
}

const incidentId = "00000000-0000-4000-8000-000000000004";
function history() {
  return page([
    { ...event("AUDIT", auditId, "2026-10-17T11:00:00Z"), kind: "VALET_SESSION_PARKED" },
    event("KEY_CUSTODY", keyId, "2026-10-17T12:00:00Z"),
    { ...event("INCIDENT", incidentId, "2026-10-17T13:00:00Z"), kind: "INCIDENT_REPORTED" },
  ]);
}

function view(locale: "en" | "ar", match = attachInvestigationLiveTimeline(
  mapInvestigationLiveSearch(search())[0]!, history(),
)) {
  return renderToStaticMarkup(
    <InvestigationWorkspace locale={locale} matches={[match]} selectedId={SESSION}
      onSelect={() => {}} onEvent={() => {}} query={DEFAULT_INVESTIGATION_QUERY} />,
  );
}

describe("Issue300 LIVE projection and frozen presentation values", () => {
  it("builds Session results without inventing history, staff or historical slot", () => {
    const [match] = mapInvestigationLiveSearch(search());
    expect(match!.origin).toBe("LIVE");
    expect(match!.session.id).toBe(SESSION);
    expect(match!.session.events).toEqual([]);
    expect(match!.session.slot).toBe("");
    expect(match!.session.currentSlot).toBeNull();
    expect(match!.count).toBe(2);
    expect(match!.witnessIds).toEqual(["AUDIT:" + auditId, "KEY_CUSTODY:" + keyId]);
    expect(match!.first).toBe("2026-10-17T11:00:00Z");
  });

  it("attaches all four canonical sources without fake incident type/status", () => {
    const [match] = mapInvestigationLiveSearch(search());
    const merged = attachInvestigationLiveTimeline(match!, history());
    expect(merged.session.timelineComplete).toBe(true);
    expect(merged.session.events.map((row) => row.source)).toEqual(["AUDIT", "KEY_CUSTODY", "INCIDENT"]);
    expect(merged.session.events[2]!.incidentStatus).toBeUndefined();
    expect(merged.session.events[2]!.occurredAt).toBe("2026-10-17T13:00:00Z");
    expect(merged.session.events.every((row) => row.origin === "LIVE")).toBe(true);
    expect(merged.session.events[1]!.actor).toBe("Same name today");
  });

  it("rejects unfinished cursor, wrong Session, untrusted DTO and DEMO match", () => {
    const match = mapInvestigationLiveSearch(search())[0]!;
    expect(() => attachInvestigationLiveTimeline(match, page(history().items, { nextCursor: "cursor_123456" })))
      .toThrow("INVESTIGATION_TIMELINE_INCOMPLETE");
    expect(() => attachInvestigationLiveTimeline(match, page([], {
      session: { ...page().session, sessionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
    }))).toThrow("INVESTIGATION_TIMELINE_SESSION_MISMATCH");
    expect(() => attachInvestigationLiveTimeline(match, { ...history(), extra: "raw secret" } as never))
      .toThrow();
    expect(() => attachInvestigationLiveTimeline({ ...match, origin: "DEMO" }, history()))
      .toThrow("INVESTIGATION_LIVE_MATCH_REQUIRED");
  });

  it("accepts only exact, strict point detail and its CURRENT incident status", () => {
    const eventRow = attachInvestigationLiveTimeline(
      mapInvestigationLiveSearch(search())[0]!, history(),
    ).session.events[2]!;
    const detail = {
      source: "INCIDENT" as const, key: { source: "INCIDENT" as const, eventId: incidentId },
      sessionId: SESSION, occurredAt: "2026-10-17T13:00:00Z",
      kind: "INCIDENT_REPORTED" as const, quality: "PARTIAL" as const,
      actor: null, participants: [], references: [], relatedEvidence: [],
      incident: {
        type: "VEHICLE_DAMAGE" as const, severity: "MEDIUM" as const,
        status: "INVESTIGATING" as const, statusBasis: "CURRENT" as const,
        resolutionAvailable: false,
      },
    };
    const enriched = attachInvestigationLiveDetail(eventRow, detail);
    expect(enriched.incidentType).toBe("VEHICLE_DAMAGE");
    expect(enriched.incidentStatus).toBe("INVESTIGATING · CURRENT");
    expect(enriched.severity).toBe("MEDIUM");
    expect(() => attachInvestigationLiveDetail(eventRow, {
      ...detail, sessionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    })).toThrow("INVESTIGATION_DETAIL_SOURCE_MISMATCH");
    expect(() => attachInvestigationLiveDetail(eventRow, {
      ...detail, incident: { ...detail.incident, description: "private" },
    })).toThrow();
  });

  it("uses Asia/Amman independent of browser locale with real calendar date", () => {
    expect(investigationLocalTime("2026-10-17T22:01:03Z"))
      .toBe("2026-10-18 01:01:03");
    expect(investigationLocalTime("2026-10-17T22:01:03Z", false))
      .toBe("01:01:03");
  });

  it.each(["en", "ar"] as const)("renders live UUID, four-source badge and truthful incident in %s", (locale) => {
    const html = view(locale);
    expect(html).toContain(SESSION);
    expect(html).toContain('data-source="KEY"');
    expect(html).toContain("2026-10-17");
    expect(html).toContain('dateTime="2026-10-17T13:00:00Z"');
    expect(html).toContain(locale === "ar" ? "حالة غير متاحة" : "Status unavailable");
    expect(html).not.toContain("KEY_MISSING");
    expect(html).not.toContain("VS-DEMO-");
    expect(html).not.toContain("Historical custody transition unavailable");
    expect(html).toContain('dir="ltr"');
  });

  it("shows an incomplete live timeline rather than a fictitious zero-event history", () => {
    const html = view("en", mapInvestigationLiveSearch(search())[0]!);
    expect(html).toContain("Recorded history unavailable");
    expect(html).not.toContain("Full available timeline <span>(0)");
  });

  it("uses the Prime-approved maximum 100 rows on the timeline API first page", async () => {
    const request = vi.fn(async (...args: Parameters<typeof readInvestigationTimeline>) => {
      expect(args).toHaveLength(3);
      return history();
    });
    await readInvestigationTimeline({ request } as never, scope(), null, new AbortController().signal);
    expect(request.mock.calls[0]?.[2]).toMatchObject({ query: { limit: 100 } });
  });
});
