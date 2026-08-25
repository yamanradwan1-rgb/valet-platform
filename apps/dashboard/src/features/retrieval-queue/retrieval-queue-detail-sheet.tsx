"use client";

import type { RetrievalQueueEntry } from "@valet/contracts";

import {
  DetailField,
  ListDetailSheet,
} from "../../components/ui/list-detail-sheet";
import { StatusBadge } from "../../components/ui/status-badge";
import { formatTimestamp } from "../../lib/format/datetime-format";
import { useTranslation } from "../../i18n/locale-provider";
import {
  queueAssigneeDetailText,
  queueTaskIdDetailText,
  requesterLabelKeyOf,
  UNSET_VALUE_FALLBACK,
} from "./retrieval-queue-display";

/**
 * D1 "Retrieval Request Detail" sheet. The requester-type code and raw task
 * identifiers are intentionally shown as technical/reference detail; the
 * friendly labels above them are the primary UX.
 */
export function RetrievalQueueDetailSheet(props: {
  entry: RetrievalQueueEntry;
  onClose: () => void;
}) {
  const { entry, onClose } = props;
  const { t, locale } = useTranslation();
  return (
    <ListDetailSheet title={t("retrievalQueue.detail.title")} onClose={onClose}>
      <DetailField label={t("retrievalQueue.detail.requestId")} mono>
        {entry.requestId}
      </DetailField>
      <DetailField label={t("retrievalQueue.detail.valetSessionId")} mono>
        {entry.valetSessionId}
      </DetailField>
      <DetailField
        label={t("retrievalQueue.detail.requestedAt")}
        value={formatTimestamp(entry.requestedAt, locale)}
      />
      <DetailField label={t("retrievalQueue.detail.status")}>
        <StatusBadge variant="retrieval" value={entry.status} size="md" />
      </DetailField>
      <DetailField
        label={t("retrievalQueue.detail.requester")}
        value={t(requesterLabelKeyOf(entry))}
      />
      <DetailField
        label={t("retrievalQueue.detail.requesterTypeCode")}
        mono
        value={entry.requesterType}
      />
      <DetailField
        label={t("retrievalQueue.detail.taskId")}
        mono
        value={queueTaskIdDetailText(entry, t("fallback.notAssigned"))}
      />
      {entry.task === null ? (
        <DetailField
          label={t("retrievalQueue.detail.taskStatus")}
          value={UNSET_VALUE_FALLBACK}
        />
      ) : (
        <DetailField label={t("retrievalQueue.detail.taskStatus")}>
          <StatusBadge variant="task" value={entry.task.status} size="md" />
        </DetailField>
      )}
      <DetailField
        label={t("retrievalQueue.detail.assigneeMembershipId")}
        mono
        value={queueAssigneeDetailText(entry, t("fallback.unassigned"))}
      />
    </ListDetailSheet>
  );
}
