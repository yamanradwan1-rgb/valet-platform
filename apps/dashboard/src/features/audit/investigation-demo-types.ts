/** Review-only data model. Never import into real Audit Events API or cache. */
export type InvestigationDemoLocale = "en" | "ar";

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
}

export interface DemoEvent {
  readonly session: string;
  readonly id: string;
  readonly time: string;
  readonly source: "AUDIT" | "KEY" | "DISPATCH" | "INCIDENT";
  readonly type: string;
  readonly actor: string | null;
  readonly role: string | null;
  readonly participant: string | null;
  readonly resource: string | null;
  readonly transition: string;
  readonly evidence: string;
}

export interface DemoSession {
  readonly id: string;
  readonly make: string;
  readonly model: string;
  readonly plate: string | null;
  readonly state: "COMPLETED" | "OPEN";
  readonly slot: string;
  readonly currentSlot: string | null;
  readonly incident: boolean;
  readonly people: readonly string[];
  readonly events: readonly DemoEvent[];
}

export interface DemoMatch {
  readonly session: DemoSession;
  readonly witnessIds: readonly string[];
  readonly count: number;
  readonly first: string;
  readonly last: string;
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
