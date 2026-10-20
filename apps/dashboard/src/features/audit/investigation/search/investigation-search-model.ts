import type {
  AuditInvestigationCoverage,
  AuditInvestigationCurrentLabel,
  AuditInvestigationFilterResponse,
  AuditInvestigationSearchItem,
  AuditInvestigationSearchResponse,
} from "@valet/contracts";

/**
 * This is a NON-VISUAL real-data model. It deliberately cannot satisfy the
 * fictional DemoSession type: search pages have no full timeline/event list.
 * Values below never assert a historical name/plate or a persistent key holder.
 */
export interface CurrentDisplayValue {
  readonly value: string | null;
  readonly basis: "CURRENT";
  readonly unavailable: boolean;
}

export interface SearchWitnessReason {
  readonly source: "AUDIT" | "KEY_CUSTODY" | "DISPATCH" | "INCIDENT";
  readonly eventId: string;
  readonly matchedBy: "KEY_SLOT" | "EMPLOYEE" | "WINDOW";
  readonly participationRole:
    "ACTOR" | "PREVIOUS_ASSIGNEE" | "NEW_ASSIGNEE" | "REPORTER" | null;
}

export interface InvestigationSearchRow {
  readonly sessionId: string;
  readonly currentState: AuditInvestigationSearchItem["currentState"];
  readonly currentStateBasis: "CURRENT";
  readonly currentVehicle: {
    readonly make: CurrentDisplayValue;
    readonly model: CurrentDisplayValue;
    readonly plate: CurrentDisplayValue;
    readonly plateCountry: CurrentDisplayValue;
    readonly temporaryDescriptor: CurrentDisplayValue;
  };
  readonly currentKeySlot: {
    readonly keySlotId: string | null;
    readonly code: CurrentDisplayValue;
  };
  readonly firstMatchedAt: string;
  readonly lastMatchedAt: string;
  /** Distinct recorded witnesses; never a count of real-world actions. */
  readonly matchingRecordCount: number;
  readonly matchReasons: readonly SearchWitnessReason[];
  /** Visible to the authorized viewer, NOT necessarily an open incident. */
  readonly hasVisibleIncident: boolean;
  /** In-window matched incidents, NOT an all-time incident count. */
  readonly matchedIncidentCount: number;
  readonly coverage: AuditInvestigationCoverage;
}

export interface InvestigationSearchPage {
  readonly items: readonly InvestigationSearchRow[];
  readonly nextCursor: string | null;
  readonly snapshotAt: string;
  readonly coverage: AuditInvestigationCoverage;
  readonly semanticsVersion: 1;
}

function current(label: AuditInvestigationCurrentLabel): CurrentDisplayValue {
  return {
    value: label.value,
    basis: label.basis,
    unavailable: label.unavailable,
  };
}

export function mapInvestigationSearchRow(
  item: AuditInvestigationSearchItem,
): InvestigationSearchRow {
  return {
    sessionId: item.sessionId,
    currentState: item.currentState,
    currentStateBasis: item.currentStateBasis,
    currentVehicle: {
      make: current(item.currentVehicle.make),
      model: current(item.currentVehicle.model),
      plate: current(item.currentVehicle.plate),
      plateCountry: current(item.currentVehicle.plateCountry),
      temporaryDescriptor: current(item.currentVehicle.temporaryDescriptor),
    },
    currentKeySlot: {
      keySlotId: item.currentKeySlot.keySlotId,
      code: current(item.currentKeySlot.code),
    },
    firstMatchedAt: item.firstMatchedAt,
    lastMatchedAt: item.lastMatchedAt,
    matchingRecordCount: item.matchingRecordCount,
    matchReasons: item.matchReasons.map((reason) => ({
      source: reason.source,
      eventId: reason.eventId,
      matchedBy: reason.matchedBy,
      participationRole: reason.participationRole ?? null,
    })),
    hasVisibleIncident: item.hasVisibleIncident,
    matchedIncidentCount: item.matchedIncidentCount,
    coverage: item.coverage,
  };
}

export function mapInvestigationSearchPage(
  response: AuditInvestigationSearchResponse,
): InvestigationSearchPage {
  return {
    items: response.items.map(mapInvestigationSearchRow),
    nextCursor: response.nextCursor,
    snapshotAt: response.snapshotAt,
    coverage: response.coverage,
    semanticsVersion: response.semanticsVersion,
  };
}

/** Filter dropdown labels are current, and may be unavailable. */
export function mapInvestigationSelectorOptions(
  response: AuditInvestigationFilterResponse,
): readonly { readonly id: string; readonly label: CurrentDisplayValue }[] {
  return response.items.map((item) => ({
    id: item.id,
    label: current(item.currentLabel),
  }));
}
