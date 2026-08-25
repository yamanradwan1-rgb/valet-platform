import type { DashboardTaskStatus, TaskOverviewEntry } from "@valet/contracts";

import {
  taskStatusLabelKey,
  taskTypeLabelKey,
} from "../../i18n/enum-labels";
import type { TranslationKey } from "../../i18n/translations/types";
import { shortIdentifier, shortIdentifierOr } from "../../lib/format/identifier-format";

/**
 * Display helpers for the Tasks surface. All six shared task statuses and both
 * task types map through the typed enum-label functions; a null assignee is an
 * honest "Unassigned", never a fabricated identity.
 */

export const UNSET_VALUE_FALLBACK = "—";

export function taskIdCell(entry: TaskOverviewEntry): string {
  return shortIdentifier(entry.taskId);
}

export function taskTypeLabelKeyOf(
  entry: TaskOverviewEntry,
): TranslationKey {
  return taskTypeLabelKey(entry.taskType);
}

export function taskStatusLabelKeyOf(
  status: DashboardTaskStatus,
): TranslationKey {
  return taskStatusLabelKey(status);
}

export function taskAssigneeCellText(
  entry: TaskOverviewEntry,
  unassignedLabel: string,
): string {
  return shortIdentifierOr(
    entry.currentAssigneeMembershipId,
    unassignedLabel,
  );
}

/** Every status the shared contract defines (used by label parity tests). */
export function supportedTaskStatuses(): readonly DashboardTaskStatus[] {
  return [
    "QUEUED",
    "ASSIGNED",
    "ACCEPTED",
    "IN_PROGRESS",
    "COMPLETED",
    "CANCELLED",
  ];
}
