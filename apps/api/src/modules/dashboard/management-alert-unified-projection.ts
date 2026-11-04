import type { ManagementAlertUnifiedItem } from "@valet/contracts";
import type { ManagementAlertSourceCase } from "./management-alert-sources/management-alert-source-contract";
import type { ManagementAlertUnifiedCandidate } from "./management-alert-unified-correlation";

type Category = ManagementAlertUnifiedItem["category"];
type Severity = ManagementAlertUnifiedItem["severity"];
type SourceKind = ManagementAlertUnifiedItem["sourceKind"];
type EventInput = {
  readonly category: Extract<
    Category,
    "ALT-05" | "ALT-07" | "ALT-09" | "ALT-13" | "ALT-15"
  >;
  readonly severity: Severity;
  readonly sourceKind: SourceKind;
  readonly organizationId: string;
  readonly locationId: string | null;
  readonly sourceId: string;
  readonly episodeId: string;
  /** Proven committed event attention clock, never a client capture clock. */
  readonly occurredAt: string;
  readonly title: string;
};

type ActiveInput = {
  readonly category: Extract<
    Category,
    "ALT-04" | "ALT-06" | "ALT-10" | "ALT-11" | "ALT-16"
  >;
  readonly severity: Severity;
  readonly sourceKind: SourceKind;
  readonly organizationId: string;
  readonly locationId: string;
  readonly sourceId: string;
  readonly episodeId: string;
  readonly occurredAt: string | null;
  readonly title: string;
};

/** Maps only the five existing Phase-1 current conditions; no behavior change. */
export function projectPhaseOneAlert(
  input: ManagementAlertSourceCase,
): ManagementAlertUnifiedCandidate {
  return { ...input, caseKind: "ACTIVE" };
}

/** Source reader MUST already have proved committed event, current right and 7d. */
export function projectCommittedOccurrence(
  input: EventInput,
): ManagementAlertUnifiedCandidate {
  return {
    ...input,
    caseKind: "OCCURRENCE",
    seen: false,
    seenEligible: true,
  };
}

/** Source reader MUST have proved current eligible state and retirement. */
export function projectActiveAlert(
  input: ActiveInput,
): ManagementAlertUnifiedCandidate {
  if (input.category === "ALT-04") {
    // Only the dedicated ALT-04 reader suppresses currently overdue ALT-01
    // inside its own SQL predicate BEFORE the capped result page.
    return { ...input, caseKind: "ACTIVE", sourceProvedAlt01Exclusion: true };
  }
  return { ...input, caseKind: "ACTIVE" };
}
