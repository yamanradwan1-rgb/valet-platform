import type {
  StaffCheckInContinuationSummary,
  StaffCheckInDraftSummary,
} from "@valet/contracts";

import type { EmployeeApiClient } from "../../lib/api/employee-api-client";
import {
  fetchCheckInContinuations,
  fetchCheckInDrafts,
} from "./check-in-api";

export type DiscoveryOutcome =
  | { readonly kind: "EMPTY" }
  | {
      readonly continuations: StaffCheckInContinuationSummary[];
      readonly drafts: StaffCheckInDraftSummary[];
      readonly kind: "MULTIPLE";
    }
  | { readonly draft: StaffCheckInDraftSummary; readonly kind: "SINGLE_DRAFT" }
  | {
      readonly continuation: StaffCheckInContinuationSummary;
      readonly kind: "SINGLE_CONTINUATION";
    };

export async function runCheckInDiscovery(
  client: EmployeeApiClient,
  locationId: string,
): Promise<DiscoveryOutcome> {
  const [draftsRes, continuationsRes] = await Promise.all([
    fetchCheckInDrafts(client, locationId),
    fetchCheckInContinuations(client, locationId),
  ]);
  const drafts = draftsRes.drafts;
  const continuations = continuationsRes.continuations;
  const total = drafts.length + continuations.length;

  if (total === 0) {
    return { kind: "EMPTY" };
  }
  if (total > 1) {
    return { continuations, drafts, kind: "MULTIPLE" };
  }
  if (drafts.length === 1 && drafts[0] !== undefined) {
    return { draft: drafts[0], kind: "SINGLE_DRAFT" };
  }
  if (continuations.length === 1 && continuations[0] !== undefined) {
    return { continuation: continuations[0], kind: "SINGLE_CONTINUATION" };
  }
  return { kind: "EMPTY" };
}
