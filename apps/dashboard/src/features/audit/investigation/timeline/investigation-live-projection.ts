import {
  auditInvestigationSearchResponseSchema,
  auditInvestigationEventDetailSchema,
  auditInvestigationTimelineResponseSchema,
  type AuditInvestigationEventDetail,
  type AuditInvestigationTimelineResponse,
} from "@valet/contracts";

import type { DemoEvent, DemoMatch, InvestigationDemoLocale, InvestigationDemoQuery } from "../../investigation-demo-types";
import type { TimelineEvidenceRow, TimelinePageView } from "./timeline-model";
import { projectTimelinePage } from "./timeline-projection";

const ZONE = "Asia/Amman";
const EVENT_LABELS: Record<string, readonly [string, string]> = {
  VALET_SESSION_CHECK_IN_COMPLETED: ["Check-in completed", "اكتمال تسجيل المركبة"],
  SLOT_ASSIGNED: ["Key slot assigned", "تعيين خانة المفتاح"],
  ASSIGNED: ["Task assigned", "تعيين المهمة"],
  VALET_SESSION_PARKED: ["Vehicle parked", "تسجيل ركن المركبة"],
  CHECKED_OUT: ["Key checked out", "إخراج المفتاح"],
  RETURNED_TO_SLOT: ["Key returned to slot", "إعادة المفتاح للخانة"],
  SLOT_CLEARED: ["Key slot cleared", "إخلاء خانة المفتاح"],
  VALET_SESSION_READY: ["Vehicle ready", "جاهزية المركبة"],
  VALET_SESSION_HANDOFF_PENDING: ["Handoff pending", "بانتظار التسليم"],
  HANDOFF_VERIFIED: ["Handoff verified", "التحقق من التسليم"],
  VALET_SESSION_COMPLETED: ["Session completed", "اكتمال الجلسة"],
  VALET_SESSION_RETRIEVAL_REQUESTED: ["Retrieval requested", "طلب استرجاع المركبة"],
  INCIDENT_REPORTED: ["Incident reported", "الإبلاغ عن حادثة"],
  REASSIGNED: ["Task reassigned", "إعادة تعيين المهمة"],
};
export function investigationEventLabel(event: DemoEvent, locale: InvestigationDemoLocale): string {
  return EVENT_LABELS[event.type]?.[locale === "ar" ? 1 : 0] ?? event.type.replaceAll("_", " ");
}

/** Render persisted UTC in the specified Location's approved timezone, never browser local. */
export function investigationLocalTime(instant: string, withDate = true): string {
  const fields = new Intl.DateTimeFormat("en-GB", {
    timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(instant));
  const part = (name: string) => fields.find((field) => field.type === name)?.value ?? "";
  const date = [part("year"), part("month"), part("day")].join("-");
  const time = [part("hour"), part("minute"), part("second")].join(":");
  return withDate ? date + " " + time : time;
}

/** Demo HH:mm remains fixture-only; live events use unambiguous ISO instants. */
export function investigationPosition(event: DemoEvent, query: InvestigationDemoQuery) {
  if (event.origin === "LIVE" && event.discoveryPosition &&
      event.discoveryPosition !== "NOT_SUPPLIED") {
    const label = event.discoveryPosition;
    return label === "BEFORE" ? "before" : label === "AFTER" ? "after" :
      label === "IN_WINDOW" ? "inWindow" : "unavailable";
  }
  if (event.origin === "LIVE" && !event.occurredAt) return "unavailable";
  const value = event.origin === "LIVE" && event.occurredAt
    ? investigationLocalTime(event.occurredAt).slice(0, 16)
    : "2026-10-23 " + event.time;
  const from = query.date + " " + query.start;
  const to = query.date + " " + query.end;
  return value < from ? "before" : value >= to ? "after" : "inWindow";
}

export function investigationDisplayTime(raw: string, live: boolean): string {
  return live ? investigationLocalTime(raw) : raw + ":00";
}

export function investigationKey(source: string, id: string): string {
  return source + ":" + id.toLowerCase();
}

/** Search contains NO timeline events. Do not invent a historical key code. */
export function mapInvestigationLiveSearch(response: unknown): DemoMatch[] {
  const search = auditInvestigationSearchResponseSchema.parse(response);
  return search.items.map((item): DemoMatch => ({
    origin: "LIVE",
    session: {
      origin: "LIVE",
      id: item.sessionId,
      make: item.currentVehicle.make.value ?? "",
      model: item.currentVehicle.model.value ?? "",
      plate: item.currentVehicle.plate.value,
      state: item.currentState === "COMPLETED" ? "COMPLETED" : "OPEN",
      currentState: item.currentState,
      slot: "", // No historical key-slot label in search DTO.
      currentSlot: item.currentKeySlot.code.value,
      incident: item.hasVisibleIncident,
      people: [],
      events: [],
      coverage: item.coverage,
    },
    witnessIds: item.matchReasons.map((reason) =>
      investigationKey(reason.source, reason.eventId)),
    count: item.matchingRecordCount,
    first: item.firstMatchedAt,
    last: item.lastMatchedAt,
    coverage: item.coverage,
  }));
}

function liveEvent(row: TimelineEvidenceRow, sessionId: string, locationLabel?: string | null): DemoEvent {
  const participants = row.participants.map((participant) => ({
    role: participant.role,
    name: participant.currentDisplayName,
  }));
  return {
    origin: "LIVE",
    session: sessionId,
    id: row.key.eventId,
    time: investigationLocalTime(row.occurredAt, false).slice(0, 5),
    source: row.key.source,
    type: row.kind,
    actor: row.actor?.currentDisplayName ?? null,
    role: row.actor ? "ACTOR" : null,
    participant: participants.map((part) =>
      part.role + ": " + (part.name ?? "Unavailable")).join(" · ") || null,
    participantRoles: participants,
    resource: row.references.map((ref) => ref.kind + " " + ref.id).join(" · ") || null,
    references: row.references,
    transition: row.kind.replaceAll("_", " "),
    evidence: row.quality + " · " + row.source,
    occurredAt: row.occurredAt,
    recordedAt: row.recordedAt,
    discoveryPosition: row.discoveryPosition,
    quality: row.quality,
    locationLabel: locationLabel ?? null,
  };
}

/** No partial timeline may masquerade as the full available history. */
export function attachInvestigationLiveTimeline(
  match: DemoMatch,
  timeline: TimelinePageView | AuditInvestigationTimelineResponse,
): DemoMatch {
  if (match.origin !== "LIVE" || match.session.origin !== "LIVE") {
    throw new Error("INVESTIGATION_LIVE_MATCH_REQUIRED");
  }
  const page = "items" in timeline
    ? projectTimelinePage(auditInvestigationTimelineResponseSchema.parse(timeline))
    : timeline;
  if (page.session.sessionId !== match.session.id) {
    throw new Error("INVESTIGATION_TIMELINE_SESSION_MISMATCH");
  }
  if (page.nextCursor !== null || Object.values(page.coverage).some(
    (source) => source.status === "UNAVAILABLE",
  )) {
    throw new Error("INVESTIGATION_TIMELINE_INCOMPLETE");
  }
  const events = page.events.map((row) => liveEvent(
    row, match.session.id, match.session.locationLabel,
  ));
  const witnessIds = page.discoveryContext
    ? page.discoveryContext.matchedKeys.map((key) =>
      investigationKey(key.source, key.eventId))
    : match.witnessIds;
  return {
    ...match,
    coverage: page.coverage,
    witnessIds,
    session: {
      ...match.session,
      currentState: page.session.currentState,
      state: page.session.currentState === "COMPLETED" ? "COMPLETED" : "OPEN",
      make: page.session.currentVehicle.make.value ?? "",
      model: page.session.currentVehicle.model.value ?? "",
      plate: page.session.currentVehicle.plate.value,
      currentSlot: page.session.currentKeySlot.code.value,
      coverage: page.coverage,
      events,
      timelineComplete: true,
    },
  };
}

/** Point detail is independently authorized; never attach a mismatched source/session. */
export function attachInvestigationLiveDetail(
  event: DemoEvent,
  input: unknown,
): DemoEvent {
  if (event.origin !== "LIVE") throw new Error("INVESTIGATION_LIVE_EVENT_REQUIRED");
  const detail: AuditInvestigationEventDetail = auditInvestigationEventDetailSchema.parse(input);
  if (detail.sessionId !== event.session || detail.key.eventId !== event.id ||
    detail.source !== event.source || detail.key.source !== event.source ||
    detail.kind !== event.type || detail.occurredAt !== event.occurredAt) {
    throw new Error("INVESTIGATION_DETAIL_SOURCE_MISMATCH");
  }
  const incident = detail.source === "INCIDENT" ? detail.incident : null;
  return {
    ...event,
    detail,
    quality: detail.quality,
    actor: detail.actor?.currentDisplayName ?? null,
    recordedAt: detail.recordedAt ?? event.recordedAt ?? null,
    references: detail.references,
    resource: detail.references.map((ref) => ref.kind + " " + ref.id).join(" · ") || null,
    participantRoles: detail.participants.map((participant) => ({
      role: participant.role,
      name: participant.membership?.currentDisplayName ?? null,
    })),
    participant: detail.participants.map((participant) =>
      participant.role + ": " + (participant.membership?.currentDisplayName ?? "Unavailable"))
      .join(" · ") || null,
    incidentType: incident?.type ?? null,
    severity: incident?.severity ?? null,
    incidentStatus: incident ? incident.status + " · CURRENT" : null,
    evidence: detail.quality + " · " + detail.source,
  };
}
