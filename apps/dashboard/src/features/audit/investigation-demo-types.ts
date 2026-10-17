/** Frozen presentation bridge: DEMO defaults remain explicit; LIVE values are scoped API facts. */
import type { AuditInvestigationCoverage, AuditInvestigationEventDetail } from "@valet/contracts";
export type InvestigationDemoLocale = "en" | "ar";
export type InvestigationOrigin = "DEMO" | "LIVE";

export interface InvestigationDemoQuery {
  readonly location: string;
  readonly date: string;
  readonly start: string;
  readonly end: string;
  readonly slot: string;
  readonly employee: string;
  readonly make: string;
  readonly model: string;
  readonly plate: string;
  readonly sessionId: string;
  /** UTC boundaries from the authorization-scoped Apply result; not user input. */
  readonly fromUtc?: string;
  readonly toUtc?: string;
}

export interface DemoEvent {
  readonly origin?: InvestigationOrigin;
  readonly session: string;
  readonly id: string;
  readonly time: string;
  readonly source: "AUDIT" | "KEY" | "KEY_CUSTODY" | "DISPATCH" | "INCIDENT";
  readonly type: string;
  readonly actor: string | null;
  readonly role: string | null;
  readonly participant: string | null;
  readonly resource: string | null;
  readonly transition: string;
  readonly evidence: string;
  readonly occurredAt?: string;
  readonly recordedAt?: string | null;
  readonly discoveryPosition?: "BEFORE" | "IN_WINDOW" | "AFTER" | "NOT_SUPPLIED";
  readonly incidentType?: string | null;
  readonly severity?: string | null;
  readonly incidentStatus?: string | null;
  readonly locationLabel?: string | null;
  readonly locationTimezone?: string;
  readonly quality?: "RECORDED" | "PARTIAL" | "UNVERIFIABLE";
  readonly participantRoles?: readonly { readonly role: string; readonly name: string | null }[];
  readonly references?: readonly { readonly kind: string; readonly id: string }[];
  readonly detail?: AuditInvestigationEventDetail | null;
}

export interface DemoSession {
  readonly origin?: InvestigationOrigin;
  readonly id: string;
  readonly make: string;
  readonly model: string;
  readonly plate: string | null;
  readonly state: "COMPLETED" | "OPEN";
  readonly currentState?: string;
  readonly slot: string;
  readonly currentSlot: string | null;
  readonly incident: boolean;
  readonly people: readonly string[];
  readonly events: readonly DemoEvent[];
  readonly coverage?: AuditInvestigationCoverage;
  readonly locationLabel?: string | null;
  readonly locationTimezone?: string;
  readonly timelineComplete?: boolean;
}

export interface DemoMatch {
  readonly origin?: InvestigationOrigin;
  readonly session: DemoSession;
  readonly witnessIds: readonly string[];
  readonly count: number;
  readonly first: string;
  readonly last: string;
  readonly coverage?: AuditInvestigationCoverage;
}

export const DEFAULT_INVESTIGATION_QUERY: InvestigationDemoQuery = {
  location: "north",
  date: "2026-10-23",
  start: "14:00",
  end: "15:00",
  slot: "K-07",
  employee: "",
  make: "",
  model: "",
  plate: "",
  sessionId: "",
};
