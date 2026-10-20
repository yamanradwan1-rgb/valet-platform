import type {
  AuditInvestigationCoverage,
  AuditInvestigationTimelineResponse,
  AuditInvestigationTimelineKey,
  AuditInvestigationTimelineSession,
  AuditInvestigationSource,
  AuditInvestigationEventDetail,
} from "@valet/contracts";

/** Purpose-specific nonvisual model. It must never be cast into DemoEvent. */
export type TimelineParticipation = {
  readonly role: "ACTOR" | "PREVIOUS_ASSIGNEE" | "NEW_ASSIGNEE" | "REPORTER";
  readonly membershipId: string | null;
  readonly currentDisplayName: string | null;
  readonly nameBasis: "CURRENT" | "UNAVAILABLE";
};

export interface TimelineEvidenceRow {
  readonly key: AuditInvestigationTimelineKey;
  readonly source: AuditInvestigationSource;
  readonly occurredAt: string;
  readonly recordedAt: string | null;
  readonly kind: string;
  readonly quality: "RECORDED" | "PARTIAL" | "UNVERIFIABLE";
  readonly actor: TimelineParticipation | null;
  readonly participants: readonly TimelineParticipation[];
  readonly references: AuditInvestigationTimelineResponse["items"][number]["references"];
  readonly relatedEvidence: AuditInvestigationTimelineResponse["items"][number]["relatedEvidence"];
  readonly discoveryPosition: "BEFORE" | "IN_WINDOW" | "AFTER" | "NOT_SUPPLIED";
  /** Null means no server highlight context was provided. */
  readonly isDiscoveryWitness: boolean | null;
}

export interface TimelinePageView {
  readonly session: AuditInvestigationTimelineSession;
  readonly events: readonly TimelineEvidenceRow[];
  readonly snapshotAt: string;
  readonly coverage: AuditInvestigationCoverage;
  readonly allSourcesAvailable: boolean;
  readonly nextCursor: string | null;
  readonly discoveryContext: AuditInvestigationTimelineResponse["discoveryContext"] | null;
}

/**
 * This is a *client cache fence*, not an authorization claim. Exact current
 * staff authority, MFA, Location and source access remain server enforced.
 */
export interface TimelineScopeIdentity {
  readonly organizationId: string;
  readonly locationId: string;
  readonly sessionId: string;
  readonly role: "COMPANY_ADMIN" | "LOCATION_MANAGER";
  readonly identityGeneration: number;
  readonly sessionGeneration: number;
  readonly selectionRevision: number;
}

export type TimelineFailure =
  | "ACCESS_REVOKED"
  | "CURSOR_EXPIRED"
  | "MALFORMED_RESPONSE"
  | "NETWORK"
  | "UNAVAILABLE";

export interface TimelineLoadState {
  readonly identity: TimelineScopeIdentity | null;
  readonly status: "IDLE" | "LOADING" | "READY" | "ERROR" | "DENIED" | "EXPIRED";
  readonly session: AuditInvestigationTimelineSession | null;
  readonly events: readonly TimelineEvidenceRow[];
  readonly coverage: AuditInvestigationCoverage | null;
  readonly snapshotAt: string | null;
  readonly discoveryContext: TimelinePageView["discoveryContext"];
  readonly nextCursor: string | null;
  readonly pageExhausted: boolean;
  readonly allSourcesAvailable: boolean;
  readonly error: TimelineFailure | null;
  readonly detail: AuditInvestigationEventDetail | null;
  readonly detailStatus: "IDLE" | "LOADING" | "READY" | "ERROR";
  readonly detailError: TimelineFailure | null;
}

export const EMPTY_TIMELINE: TimelineLoadState = {
  identity: null,
  status: "IDLE",
  session: null,
  events: [],
  coverage: null,
  snapshotAt: null,
  discoveryContext: null,
  nextCursor: null,
  pageExhausted: false,
  allSourcesAvailable: false,
  error: null,
  detail: null,
  detailStatus: "IDLE",
  detailError: null,
};
