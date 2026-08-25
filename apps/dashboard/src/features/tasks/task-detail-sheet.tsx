"use client";

import type { TaskOverviewEntry } from "@valet/contracts";

import {
  DetailField,
  ListDetailSheet,
} from "../../components/ui/list-detail-sheet";
import { StatusBadge } from "../../components/ui/status-badge";
import { formatTimestamp } from "../../lib/format/datetime-format";
import { useTranslation } from "../../i18n/locale-provider";
import {
  taskAssigneeCellText,
  taskTypeLabelKeyOf,
} from "./tasks-display";

/**
 * D1 "Task Detail" sheet: current task facts only. The task-type code is
 * intentionally shown as technical/reference detail beneath its friendly label.
 */
export function TaskDetailSheet(props: {
  entry: TaskOverviewEntry;
  onClose: () => void;
}) {
  const { entry, onClose } = props;
  const { t, locale } = useTranslation();
  return (
    <ListDetailSheet title={t("tasks.detail.title")} onClose={onClose}>
      <DetailField label={t("tasks.detail.taskId")} mono>
        {entry.taskId}
      </DetailField>
      <DetailField
        label={t("tasks.detail.taskType")}
        value={t(taskTypeLabelKeyOf(entry))}
      />
      <DetailField
        label={t("tasks.detail.taskTypeCode")}
        mono
        value={entry.taskType}
      />
      <DetailField label={t("tasks.detail.status")}>
        <StatusBadge variant="task" value={entry.status} size="md" />
      </DetailField>
      <DetailField label={t("tasks.detail.valetSessionId")} mono>
        {entry.valetSessionId}
      </DetailField>
      <DetailField
        label={t("tasks.detail.assigneeMembershipId")}
        mono
        value={taskAssigneeCellText(entry, t("fallback.unassigned"))}
      />
      <DetailField
        label={t("tasks.detail.createdAt")}
        value={formatTimestamp(entry.createdAt, locale)}
      />
      <DetailField
        label={t("tasks.detail.updatedAt")}
        value={formatTimestamp(entry.updatedAt, locale)}
      />
    </ListDetailSheet>
  );
}
