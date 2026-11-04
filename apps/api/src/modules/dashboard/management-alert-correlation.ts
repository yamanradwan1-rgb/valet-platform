import type {
  ManagementAlertPreviewItem,
  ManagementAlertPreviewResponse,
} from "@valet/contracts";

/** Only sanitized cases produced by source-authorized, current-state readers. */
export interface ManagementAlertCandidate extends Omit<
  ManagementAlertPreviewItem,
  "id"
> {
  readonly organizationId: string;
}

const PREVIEW_LIMIT = 20;

function identity(
  candidate: Pick<
    ManagementAlertPreviewItem,
    "category" | "sourceId" | "episodeId"
  >,
): string {
  return `${candidate.category}:${candidate.sourceId}:${candidate.episodeId}`;
}

/**
 * Correlation is applied after each source has filtered for authority and before
 * the final LIMIT. Differing current episodes for one Task are contradictory
 * source evidence and must fail closed, not receive an arbitrary tie-breaker.
 * Each family must supply its first 21 distinct eligible cases, ordered by the
 * same category priority and descending authoritative source time.
 */
export function correlateManagementAlertPreview(
  candidates: readonly ManagementAlertCandidate[],
  authorized: { readonly organizationId: string; readonly locationId: string },
): ManagementAlertPreviewResponse {
  const unique = new Map<string, ManagementAlertCandidate>();
  const taskIdentities = new Map<string, Set<string>>();

  for (const candidate of candidates) {
    if (
      candidate.organizationId !== authorized.organizationId ||
      candidate.locationId !== authorized.locationId
    ) {
      throw new Error(
        "Management alert reader returned a case outside the authorized scope.",
      );
    }
    const key = identity(candidate);
    if (candidate.sourceKind === "TASK") {
      const episodeKeys =
        taskIdentities.get(candidate.sourceId) ?? new Set<string>();
      episodeKeys.add(key);
      taskIdentities.set(candidate.sourceId, episodeKeys);
    }
    const existing = unique.get(key);
    if (
      existing !== undefined &&
      (existing.severity !== candidate.severity ||
        existing.sourceKind !== candidate.sourceKind ||
        existing.occurredAt !== candidate.occurredAt ||
        existing.title !== candidate.title)
    ) {
      // A current episode has one authoritative projection. Never let
      // whichever reader finishes last determine its severity or timestamp.
      throw new Error("Conflicting Management alert source projections.");
    }
    unique.set(key, candidate);
  }

  const ambiguousTasks = [...taskIdentities.values()].filter(
    (episodes) => episodes.size > 1,
  ).length;
  if (ambiguousTasks > 0) {
    // Operational diagnostic only; no Task IDs, tenant or source metadata.
    console.warn("ISSUE414_UNPROVEN_UNCOVERED_TASK_EPISODE", {
      omittedTaskCount: ambiguousTasks,
    });
  }

  const authorizedCases = [...unique.values()]
    .filter((candidate) => {
      if (candidate.sourceKind !== "TASK") return true;
      // A Task may have exactly one current actionable uncovered episode.
      return taskIdentities.get(candidate.sourceId)?.size === 1;
    })
    .sort((left, right) => {
      if (left.severity !== right.severity)
        return left.severity === "CRITICAL" ? -1 : 1;
      const timeOrder =
        Date.parse(right.occurredAt) - Date.parse(left.occurredAt);
      if (timeOrder !== 0) return timeOrder;
      return identity(left).localeCompare(identity(right));
    });

  const items: ManagementAlertPreviewItem[] = authorizedCases
    .slice(0, PREVIEW_LIMIT)
    .map((candidate) => ({
      id: identity(candidate),
      category: candidate.category,
      severity: candidate.severity,
      sourceKind: candidate.sourceKind,
      sourceId: candidate.sourceId,
      episodeId: candidate.episodeId,
      locationId: candidate.locationId,
      occurredAt: candidate.occurredAt,
      title: candidate.title,
    }));
  return {
    count: items.length,
    hasMore: authorizedCases.length > PREVIEW_LIMIT,
    items,
  };
}
