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
    /** Set ONLY by the ALT-04 reader which excludes overdue ALT-01 in SQL before LIMIT. */
    readonly sourceProvedAlt01Exclusion?: true;
  };

export interface UnifiedAuthorizedScope {
  readonly organizationId: string;
  readonly locationId: string;
  /** Server-derived, freshly reauthorized CA organization-only source rights. */
  readonly allowOrganizationOnly: boolean;
}

const PAGE_LIMIT = 20;

/** Existing P1 readers tie by sourceId DESC; event readers tie by event ID. */
function sourceTieId(candidate: ManagementAlertUnifiedCandidate): string {
  switch (candidate.category) {
    case "ALT-05":
    case "ALT-07":
    case "ALT-09":
    case "ALT-10":
    case "ALT-11":
    case "ALT-13":
    case "ALT-15":
      return candidate.episodeId;
    default:
      return candidate.sourceId;
  }
}

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
    if (
      candidate.category === "ALT-04" &&
      candidate.sourceProvedAlt01Exclusion !== true
    ) {
      // Excluding overlaps only after per-source LIMIT 21 can undercount.
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
    // No invented age for current Location/intake or commercial restriction.
    // Equal missing clocks tie deterministically by category/source identity.
    const aTime = a.occurredAt === null ? 0 : Date.parse(a.occurredAt);
    const bTime = b.occurredAt === null ? 0 : Date.parse(b.occurredAt);
    const time = bTime - aTime;
    if (time !== 0) return time;
    // Presentation tie ordering is not source chronology. Exact source
    // queries must apply the same tie key before their LIMIT 21, with all
    // category suppression/Seen and source permissions already applied.
    const family = a.category.localeCompare(b.category);
    if (family !== 0) return family;
    const bySource = sourceTieId(b).localeCompare(sourceTieId(a));
    return bySource !== 0 ? bySource : identity(a).localeCompare(identity(b));
  });
  return {
    items: eligible.slice(0, PAGE_LIMIT).map(publicItem),
    count: Math.min(eligible.length, PAGE_LIMIT),
    hasMore: eligible.length > PAGE_LIMIT,
  };
}
