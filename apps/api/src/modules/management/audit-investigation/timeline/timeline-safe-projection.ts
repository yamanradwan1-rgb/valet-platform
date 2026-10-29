import type {
  AuditInvestigationEventDetail,
  AuditInvestigationTimelineEvent,
} from "@valet/contracts";
import { incidentTypeSchema, incidentSeveritySchema } from "@valet/contracts";
import { managementAuditKnownEventTypes } from "../../management-audit-event-catalog";
import type { TimelineSourceRow } from "./timeline-source-query";

const knownAuditKinds = new Set<string>(managementAuditKnownEventTypes);
const keyKinds = new Set([
  "SLOT_ASSIGNED",
  "SLOT_CLEARED",
  "CHECKED_OUT",
  "RETURNED_TO_SLOT",
  "RELEASED",
]);
const dispatchKinds = new Set([
  "QUEUED",
  "ASSIGNED",
  "REASSIGNED",
  "EMERGENCY_TAKEOVER",
  "ACCEPTED",
  "DECLINED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
]);
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function person(membershipId: string | null, name: string | null) {
  if (!membershipId || !uuidPattern.test(membershipId)) return null;
  const normalized = name?.trim() ?? "";
  return {
    membershipId,
    currentDisplayName:
      normalized.length >= 3 &&
      normalized.length <= 201 &&
      !/\p{Cc}/u.test(normalized)
        ? normalized
        : null,
  };
}

/** Safe explicit roles. Current Task assignee is never substituted for actor,
 * previous assignee, new assignee, reporter or completion actor. */
function participants(row: TimelineSourceRow) {
  if (row.source === "DISPATCH") {
    return [
      ...(row.previousId
        ? [
            {
              role: "PREVIOUS_ASSIGNEE" as const,
              membership: person(row.previousId, row.previousName),
            },
          ]
        : []),
      ...(row.nextId
        ? [
            {
              role: "NEW_ASSIGNEE" as const,
              membership: person(row.nextId, row.nextName),
            },
          ]
        : []),
    ];
  }
  if (row.source === "INCIDENT" && row.reporterId) {
    return [
      {
        role: "REPORTER" as const,
        membership: person(row.reporterId, row.reporterName),
      },
    ];
  }
  return [];
}

function references(row: TimelineSourceRow, sessionId: string) {
  const refs: AuditInvestigationTimelineEvent["references"] = [
    { kind: "SESSION", id: sessionId },
  ];
  if (row.source === "KEY_CUSTODY" && row.keySlotId) {
    refs.push({ kind: "KEY_SLOT", id: row.keySlotId });
  }
  if (row.source === "DISPATCH" && row.taskId) {
    refs.push({ kind: "TASK", id: row.taskId });
  }
  if (row.source === "INCIDENT") {
    refs.push({ kind: "INCIDENT", id: row.id });
  }
  return refs;
}

function safeKind(row: TimelineSourceRow): string {
  if (row.source === "AUDIT") {
    return knownAuditKinds.has(row.kind) ? row.kind : "UNKNOWN";
  }
  if (row.source === "KEY_CUSTODY") {
    return keyKinds.has(row.kind) ? row.kind : "UNKNOWN";
  }
  if (row.source === "DISPATCH") {
    return dispatchKinds.has(row.kind) ? row.kind : "UNKNOWN";
  }
  return "INCIDENT_REPORTED";
}

export function projectTimelineRow(
  row: TimelineSourceRow,
  sessionId: string,
): AuditInvestigationTimelineEvent {
  const kind = safeKind(row);
  const unknown = kind === "UNKNOWN";
  const incidentPartiallyKnown =
    row.source === "INCIDENT" &&
    (!incidentTypeSchema.safeParse(row.incidentType).success ||
      !incidentSeveritySchema.safeParse(row.incidentSeverity).success ||
      !["OPEN", "INVESTIGATING", "RESOLVED", "CLOSED"].includes(
        row.incidentStatus ?? "",
      ));
  return {
    key: { source: row.source, eventId: row.id },
    occurredAt: row.occurredAt.toISOString(),
    recordedAt: row.recordedAt.toISOString(),
    kind,
    quality: unknown
      ? "UNVERIFIABLE"
      : incidentPartiallyKnown
        ? "PARTIAL"
        : row.evidenceQuality ?? "RECORDED",
    actor:
      unknown || row.source === "INCIDENT" ||
        (row.source === "AUDIT" &&
          row.evidenceQuality !== undefined && row.evidenceQuality !== "RECORDED")
        ? null
        : person(row.actorId, row.actorName),
    participants: unknown || row.evidenceQuality === "UNVERIFIABLE"
      ? [] : participants(row),
    references: unknown || row.evidenceQuality === "UNVERIFIABLE"
      ? [{ kind: "SESSION", id: sessionId }]
      : references(row, sessionId),
    relatedEvidence: [],
  };
}

/** Point-detail returns only explicitly permitted DTO fields. Incident
 * resolution detail requires a separate resource permission and remains
 * unavailable here even if the mutable Incident has a resolved-at column. */
export function projectTimelineDetail(
  row: TimelineSourceRow,
  sessionId: string,
): AuditInvestigationEventDetail {
  const base = projectTimelineRow(row, sessionId);
  const details = {
    key: base.key,
    sessionId,
    occurredAt: base.occurredAt,
    recordedAt: base.recordedAt,
    quality: base.quality,
    actor: base.actor,
    participants: base.participants,
    references: base.references,
    relatedEvidence: base.relatedEvidence,
  };
  if (row.source === "AUDIT") {
    return { ...details, source: "AUDIT", kind: base.kind };
  }
  if (row.source === "KEY_CUSTODY") {
    if (
      !keyKinds.has(row.kind) ||
      (!row.keySlotId && row.kind !== "RELEASED")
    ) {
      throw new Error("Custody detail lacks safely recorded source fields.");
    }
    return {
      ...details,
      source: "KEY_CUSTODY",
      kind: row.kind as Extract<
        AuditInvestigationEventDetail,
        { source: "KEY_CUSTODY" }
      >["kind"],
      keySlotId: row.keySlotId,
    };
  }
  if (row.source === "DISPATCH") {
    if (!row.taskId || !dispatchKinds.has(row.kind)) {
      throw new Error("Dispatch detail lacks safely recorded source fields.");
    }
    return {
      ...details,
      source: "DISPATCH",
      kind: row.kind as Extract<
        AuditInvestigationEventDetail,
        { source: "DISPATCH" }
      >["kind"],
      taskId: row.taskId,
    };
  }
  if (
    !incidentTypeSchema.safeParse(row.incidentType).success ||
    !incidentSeveritySchema.safeParse(row.incidentSeverity).success ||
    !["OPEN", "INVESTIGATING", "RESOLVED", "CLOSED"].includes(
      row.incidentStatus ?? "",
    )
  ) {
    throw new Error("Incident detail lacks safely recognized source fields.");
  }
  return {
    ...details,
    source: "INCIDENT",
    kind: "INCIDENT_REPORTED",
    incident: {
      type: row.incidentType as Extract<
        AuditInvestigationEventDetail,
        { source: "INCIDENT" }
      >["incident"]["type"],
      severity: row.incidentSeverity as Extract<
        AuditInvestigationEventDetail,
        { source: "INCIDENT" }
      >["incident"]["severity"],
      status: row.incidentStatus as Extract<
        AuditInvestigationEventDetail,
        { source: "INCIDENT" }
      >["incident"]["status"],
      statusBasis: "CURRENT",
      resolutionAvailable: false,
    },
  };
}
