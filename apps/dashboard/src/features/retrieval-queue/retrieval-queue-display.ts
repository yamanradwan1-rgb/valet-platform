import type { RetrievalQueueEntry } from "@valet/contracts";

import {
  requesterTypeLabelKey,
  retrievalStatusLabelKey,
} from "../../i18n/enum-labels";
import type { TranslationKey } from "../../i18n/translations/types";
import { shortIdentifier, shortIdentifierOr } from "../../lib/format/identifier-format";

/**
 * Display helpers for the Vehicle Retrieval Queue surface. Task facts may be
 * entirely absent (`task === null`); that renders as honest "not assigned"
 * states rather than placeholder task data.
 */

export const UNSET_VALUE_FALLBACK = "—";

export function requestIdCell(entry: RetrievalQueueEntry): string {
  return shortIdentifier(entry.requestId);
}

export function requesterLabelKeyOf(
  entry: RetrievalQueueEntry,
): TranslationKey {
  return requesterTypeLabelKey(entry.requesterType);
}

export function statusLabelKeyOf(entry: RetrievalQueueEntry): TranslationKey {
  return retrievalStatusLabelKey(entry.status);
}

/** Table cell text; null task or null assignee both mean unassigned. */
export function queueAssigneeCellText(
  entry: RetrievalQueueEntry,
  unassignedLabel: string,
): string | null {
  const assignee = entry.task?.currentAssigneeMembershipId ?? null;
  return assignee === null
    ? null
    : shortIdentifierOr(assignee, unassignedLabel);
}

export function queueTaskIdDetailText(
  entry: RetrievalQueueEntry,
  notAssignedLabel: string,
): string {
  return entry.task?.taskId ?? notAssignedLabel;
}

export function queueAssigneeDetailText(
  entry: RetrievalQueueEntry,
  unassignedLabel: string,
): string {
  const assignee = entry.task?.currentAssigneeMembershipId ?? null;
  return assignee === null ? unassignedLabel : shortIdentifier(assignee);
}
