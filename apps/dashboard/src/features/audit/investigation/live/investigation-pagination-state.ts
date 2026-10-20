import type { AuditInvestigationCoverage } from "@valet/contracts";
import type { DemoMatch } from "../../investigation-demo-types";

export interface InvestigationPageState {
  readonly nextCursor: string | null;
  readonly snapshotAt: string | null;
  readonly pending: boolean;
  readonly error: string | null;
  readonly added: number;
  /** Server Location/source coverage persists even if items is empty. */
  readonly coverage: AuditInvestigationCoverage | null;
  readonly coverageVaries: boolean;
}

export const initialInvestigationPage: InvestigationPageState = {
  nextCursor: null, snapshotAt: null, pending: false, error: null, added: 0,
  coverage: null, coverageVaries: false,
};

/** Existing rows retain their order and identity; duplicate pages cannot
 * inflate the loaded count or replace already selected historical data. */
export function appendInvestigationSessions(
  previous: readonly DemoMatch[], incoming: readonly DemoMatch[],
): readonly DemoMatch[] {
  const seen = new Set(previous.map((row) => row.session.id));
  const added: DemoMatch[] = [];
  for (const row of incoming) {
    if (seen.has(row.session.id)) continue;
    seen.add(row.session.id);
    added.push(row);
  }
  return [...previous, ...added];
}

export function nextInvestigationPageState(
  previous: InvestigationPageState,
  page: {
    readonly snapshotAt: string;
    readonly nextCursor: string | null;
    readonly coverage: AuditInvestigationCoverage;
  },
  added: number,
): InvestigationPageState {
  if (previous.snapshotAt && previous.snapshotAt !== page.snapshotAt)
    throw new Error("INVESTIGATION_SEARCH_SNAPSHOT_CHANGED");
  return {
    nextCursor: page.nextCursor, snapshotAt: page.snapshotAt,
    pending: false, error: null, added,
    coverage: previous.coverage ?? page.coverage,
    coverageVaries: previous.coverageVaries || Boolean(previous.coverage &&
      JSON.stringify(previous.coverage) !== JSON.stringify(page.coverage)),
  };
}
