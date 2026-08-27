"use client";

import type { SessionOverviewEntry } from "@valet/contracts";

import {
  DetailField,
  ListDetailSheet,
} from "../../components/ui/list-detail-sheet";
import { StatusBadge } from "../../components/ui/status-badge";
import { formatTimestamp } from "../../lib/format/datetime-format";
import { useTranslation } from "../../i18n/locale-provider";
import { UNSET_VALUE_FALLBACK } from "./sessions-display";

/**
 * D1 "Service Session Detail" sheet: only backend-provided session and vehicle
 * reference fields. Nullable values render as honest neutral fallbacks.
 */
export function SessionDetailSheet(props: {
  entry: SessionOverviewEntry;
  timeZone: string | null | undefined;
  onClose: () => void;
}) {
  const { entry, onClose, timeZone } = props;
  const { t, locale } = useTranslation();
  const vehicle = entry.vehicle;
  return (
    <ListDetailSheet title={t("sessions.detail.title")} onClose={onClose}>
      <DetailField label={t("sessions.detail.sessionId")} mono>
        {entry.sessionId}
      </DetailField>
      <DetailField label={t("sessions.detail.vehicleId")} mono>
        {vehicle.vehicleId}
      </DetailField>
      <DetailField
        label={t("sessions.detail.plateNumber")}
        value={vehicle.plateNumberNormalized ?? UNSET_VALUE_FALLBACK}
      />
      <DetailField
        label={t("sessions.detail.plateCountry")}
        value={vehicle.plateCountry ?? UNSET_VALUE_FALLBACK}
      />
      <DetailField
        label={t("sessions.detail.temporaryDescriptor")}
        value={vehicle.temporaryDescriptor ?? UNSET_VALUE_FALLBACK}
      />
      <DetailField label={t("sessions.detail.state")}>
        <StatusBadge variant="session" value={entry.state} size="md" />
      </DetailField>
      <DetailField
        label={t("sessions.detail.createdAt")}
        value={formatTimestamp(entry.createdAt, locale, timeZone)}
      />
      <DetailField
        label={t("sessions.detail.updatedAt")}
        value={formatTimestamp(entry.updatedAt, locale, timeZone)}
      />
      <DetailField
        label={t("sessions.detail.parkingSpotId")}
        mono
        value={entry.parkingSpotId ?? UNSET_VALUE_FALLBACK}
      />
      <DetailField
        label={t("sessions.detail.keySlotId")}
        mono
        value={entry.keySlotId ?? UNSET_VALUE_FALLBACK}
      />
      <DetailField
        label={t("sessions.detail.assigneeMembershipId")}
        mono
        value={
          entry.currentAssigneeMembershipId ?? t("fallback.unassigned")
        }
      />
    </ListDetailSheet>
  );
}
