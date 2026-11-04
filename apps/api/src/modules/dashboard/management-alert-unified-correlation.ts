import {
  managementAlertUnifiedItemSchema,
  type ManagementAlertUnifiedItem,
  type ManagementAlertUnifiedPreviewResponse,
} from "@valet/contracts";

type WithoutId<T> = T extends object ? Omit<T, "id"> : never;
/** Input is already source-authorized, current, and occurrence Seen-filtered. */
export type ManagementAlertUnifiedCandidate =
  WithoutId<ManagementAlertUnifiedItem> & {
    readonly organizationId: string;
    /** Actual source-proven same-attempt key, never guessed from timestamps. */
    readonly retrievalAttemptKey?: string;
  };

export interface UnifiedAuthorizedScope {
  readonly organizationId: string;
  readonly locationId: string;
  /** Server-derived, freshly reauthorized CA organization-only source rights. */
  readonly allowOrganizationOnly: boolean;
}

const PAGE_LIMIT = 20;

function identity(input: {
  readonly category: string;
  readonly sourceId: string;
  readonly episodeId: string;
}): string {
  return `${input.category}:${input.sourceId}:${input.episodeId}`;
}

function publicItem(
  candidate: ManagementAlertUnifiedCandidate,
): ManagementAlertUnifiedItem {
  const common = {
    id: identity(candidate),
    category: candidate.category,
    severity: candidate.severity,
    sourceKind: candidate.sourceKind,
    sourceId: candidate.sourceId,
    episodeId: candidate.episodeId,
    locationId: candidate.locationId,
    occurredAt: candidate.occurredAt,
    title: candidate.title,
  };
  return managementAlertUnifiedItemSchema.parse(
    candidate.caseKind === "OCCURRENCE"
      ? {
          ...common,
          caseKind: "OCCURRENCE",
          seen: candidate.seen,
          seenEligible: candidate.seenEligible,
        }
      : { ...common, caseKind: "ACTIVE" },
  );
}

/**
 * Pure late-stage correlation. This never authorizes a row. Every source
 * reader must prove exact tenant/Location/category authority and return up
 * to 21 eligible cases BEFORE this function, including unseen filtering.
 */
export function correlateManagementAlertUnifiedPreview(
  candidates: readonly ManagementAlertUnifiedCandidate[],
  scope: UnifiedAuthorizedScope,
): ManagementAlertUnifiedPreviewResponse {
  const unique = new Map<string, ManagementAlertUnifiedCandidate>();
  const uncoveredTaskKeys = new Map<string, Set<string>>();
  const overdueAttempts = new Set<string>();
  const uncertainPayments = new Set<string>();

  for (const candidate of candidates) {
    if (
      candidate.organizationId !== scope.organizationId ||
      (candidate.locationId !== scope.locationId &&
        !(
          scope.allowOrganizationOnly &&
          candidate.locationId === null &&
          (candidate.category === "ALT-15" || candidate.category === "ALT-17")
        ))
    ) {
      throw new Error(
        "Management alert source returned an unauthorized scope.",
      );
    }
    if (
      candidate.retrievalAttemptKey !== undefined &&
      (candidate.retrievalAttemptKey.length < 1 ||
        candidate.retrievalAttemptKey.length > 150)
    ) {
      throw new Error("Unproven or invalid retrieval attempt correlation key.");
    }
    const item = publicItem(candidate);
    const existing = unique.get(item.id);
    if (
      existing !== undefined &&
      (JSON.stringify(publicItem(existing)) !== JSON.stringify(item) ||
        existing.retrievalAttemptKey !== candidate.retrievalAttemptKey)
    ) {
      throw new Error("Conflicting projections for one alert occurrence.");
    }
    unique.set(item.id, candidate);
    if (candidate.category === "ALT-02" || candidate.category === "ALT-03") {
      const cases =
        uncoveredTaskKeys.get(candidate.sourceId) ?? new Set<string>();
      cases.add(item.id);
      uncoveredTaskKeys.set(candidate.sourceId, cases);
    }
    if (candidate.category === "ALT-01" && candidate.retrievalAttemptKey) {
      overdueAttempts.add(candidate.retrievalAttemptKey);
    }
    if (candidate.category === "ALT-11")
      uncertainPayments.add(candidate.sourceId);
  }

  const eligible = [...unique.values()].filter((candidate) => {
    if (candidate.category === "ALT-04" && !candidate.retrievalAttemptKey) {
      // Without a proven attempt join ALT-01 overlap cannot be ruled out.
      return false;
    }
    if (
      (candidate.category === "ALT-02" || candidate.category === "ALT-03") &&
      uncoveredTaskKeys.get(candidate.sourceId)?.size !== 1
    )
      return false; // Contradictory current queue episodes: omit the Task.
    if (
      candidate.category === "ALT-04" &&
      candidate.retrievalAttemptKey &&
      overdueAttempts.has(candidate.retrievalAttemptKey)
    )
      return false;
    if (
      candidate.category === "ALT-10" &&
      uncertainPayments.has(candidate.sourceId)
    )
      return false;
    // An unresolved operation beneath ALT-11's delay must be suppressed by
    // the financial source reader even when no ALT-11 is present here.
    return true;
  });
  eligible.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "CRITICAL" ? -1 : 1;
    const time = Date.parse(b.occurredAt) - Date.parse(a.occurredAt);
    return time !== 0 ? time : identity(a).localeCompare(identity(b));
  });
  return {
    items: eligible.slice(0, PAGE_LIMIT).map(publicItem),
    count: Math.min(eligible.length, PAGE_LIMIT),
    hasMore: eligible.length > PAGE_LIMIT,
  };
}
