import {
  auditInvestigationTimelineResponseSchema,
  type AuditInvestigationTimelineEvent,
  type AuditInvestigationTimelineResponse,
  type AuditInvestigationSource,
} from "@valet/contracts";
import type {
  TimelineEvidenceRow,
  TimelinePageView,
  TimelineParticipation,
} from "./timeline-model";

const SOURCE_RANK: Readonly<Record<AuditInvestigationSource, number>> = {
  AUDIT: 0,
  KEY_CUSTODY: 1,
  DISPATCH: 2,
  INCIDENT: 3,
};

/** UTF-8/canonical UUID ordering, without locale-dependent sorting. */
function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function compareTimelineRows(
  left: Pick<TimelineEvidenceRow, "key" | "occurredAt">,
  right: Pick<TimelineEvidenceRow, "key" | "occurredAt">,
): number {
  return Date.parse(left.occurredAt) - Date.parse(right.occurredAt) ||
    SOURCE_RANK[left.key.source] - SOURCE_RANK[right.key.source] ||
    compareText(left.key.eventId.toLowerCase(), right.key.eventId.toLowerCase());
}

export function timelineRecordKey(row: TimelineEvidenceRow): string {
  return row.key.source + ":" + row.key.eventId.toLowerCase();
}

function person(
  membership: AuditInvestigationTimelineEvent["actor"],
  role: TimelineParticipation["role"],
): TimelineParticipation {
  return {
    role,
    membershipId: membership?.membershipId ?? null,
    currentDisplayName: membership?.currentDisplayName ?? null,
    nameBasis: membership?.currentDisplayName ? "CURRENT" : "UNAVAILABLE",
  };
}

/**
 * Preserve all four canonical source distinctions and immutable UTC timestamps.
 * Neither a missing actor nor a participant is treated as a key holder,
 * completer, or cause of an incident.
 */
export function projectTimelinePage(input: unknown): TimelinePageView {
  const response: AuditInvestigationTimelineResponse =
    auditInvestigationTimelineResponseSchema.parse(input);
  const context = response.discoveryContext ?? null;
  const witnesses = new Set(
    context?.matchedKeys.map((key) => key.source + ":" + key.eventId.toLowerCase()) ?? [],
  );
  const events = response.items.map((record): TimelineEvidenceRow => {
    const key = record.key.source + ":" + record.key.eventId.toLowerCase();
    const sourceCoverage = response.coverage[record.key.source].status;
    if (sourceCoverage === "NOT_AUTHORIZED" || sourceCoverage === "NOT_SUPPORTED") {
      throw new Error("UNAUTHORIZED_OR_UNSUPPORTED_SOURCE_ROW");
    }
    const occurred = Date.parse(record.occurredAt);
    const unknownAudit = record.key.source === "AUDIT" && record.kind === "UNKNOWN";
    const position = !context
      ? "NOT_SUPPLIED"
      : occurred < Date.parse(context.from)
        ? "BEFORE"
        : occurred >= Date.parse(context.to)
          ? "AFTER"
          : "IN_WINDOW";
    return {
      key: record.key,
      source: record.key.source,
      occurredAt: record.occurredAt,
      recordedAt: record.recordedAt ?? null,
      kind: record.kind,
      quality: record.quality,
      actor: !unknownAudit && record.actor ? person(record.actor, "ACTOR") : null,
      participants: unknownAudit ? [] : record.participants.map((participant) =>
        person(participant.membership, participant.role)),
      references: unknownAudit ? [] : record.references,
      relatedEvidence: unknownAudit ? [] : record.relatedEvidence,
      discoveryPosition: position,
      isDiscoveryWitness: context ? witnesses.has(key) : null,
    };
  });

  const keys = new Set<string>();
  for (let index = 0; index < events.length; index += 1) {
    const record = events[index]!;
    const key = timelineRecordKey(record);
    if (keys.has(key) || (index > 0 && compareTimelineRows(events[index - 1]!, record) >= 0)) {
      throw new Error("INVALID_TIMELINE_ORDER");
    }
    keys.add(key);
  }
  // A retryable source outage cannot become a successful, apparently complete page.
  if (Object.values(response.coverage).some((source) => source.status === "UNAVAILABLE")) {
    throw new Error("TIMELINE_SOURCE_UNAVAILABLE");
  }
  return {
    session: response.session,
    events,
    snapshotAt: response.snapshotAt,
    nextCursor: response.nextCursor,
    coverage: response.coverage,
    allSourcesAvailable: Object.values(response.coverage)
      .every((source) => source.status === "AVAILABLE"),
    discoveryContext: context,
  };
}
