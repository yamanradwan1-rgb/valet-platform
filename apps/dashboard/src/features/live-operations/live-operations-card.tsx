"use client";

import { StatusBadge } from "../../components/ui/status-badge";
import {
  freshnessLabelKey,
  taskTypeLabelKey,
} from "../../i18n/enum-labels";
import { useTranslation } from "../../i18n/locale-provider";
import { shortIdentifier } from "../../lib/format/identifier-format";
import type { LiveOperationsItem } from "./live-operations-api";
import {
  areaLabelText,
  formatTimeOfDay,
  vehicleDisplayName,
} from "./live-operations-view-model";

interface LiveVehicleCardProps {
  item: LiveOperationsItem;
  selected: boolean;
  onSelect: (trackingSessionId: string) => void;
}

/**
 * One tracked-vehicle operational card (D1 "Tracked vehicles").
 *
 * Shows only backend-supported facts. `position === null` renders an honest
 * "No current position" state with em-dash cells — never a guessed location.
 * The whole card is a toggle button that highlights the related marker, so no
 * operational fact depends on hover.
 */
export function LiveVehicleCard({
  item,
  selected,
  onSelect,
}: LiveVehicleCardProps) {
  const { t, locale } = useTranslation();
  const position = item.position;
  const areas = position === null ? null : areaLabelText(position);

  return (
    <button
      type="button"
      className={selected ? "live-op-card is-selected" : "live-op-card"}
      aria-pressed={selected}
      onClick={() => onSelect(item.trackingSessionId)}
    >
      <span className="live-op-card-head">
        <span className="live-op-card-title-wrap">
          <span className="live-op-card-title">
            {vehicleDisplayName(
              item.vehicle,
              t("liveOperations.vehicle.fallbackName"),
            )}
          </span>
          <span className="live-op-card-subtitle">
            {t(taskTypeLabelKey(item.taskType))} ·{" "}
            <span className="cell-mono">{shortIdentifier(item.taskId)}</span>
          </span>
        </span>
        <StatusBadge variant="session" value={item.sessionState} />
      </span>

      <span className="live-op-fact-grid">
        <Fact
          label={t("liveOperations.item.freshness")}
          value={
            position === null
              ? t("liveOperations.item.noPosition")
              : t(freshnessLabelKey(position.freshness))
          }
        />
        <Fact
          label={t("liveOperations.item.capturedAt")}
          mono={false}
          value={
            position === null ? "—" : formatTimeOfDay(position.capturedAt, locale)
          }
        />
        <Fact
          label={t("liveOperations.item.latitude")}
          value={position === null ? "—" : String(position.latitude)}
        />
        <Fact
          label={t("liveOperations.item.longitude")}
          value={position === null ? "—" : String(position.longitude)}
        />
      </span>

      {areas !== null && (
        <span className="live-op-areas">
          {t("liveOperations.item.areas")}: {areas}
        </span>
      )}

      <span className="live-op-fact-grid is-ids">
        <Fact
          label={t("liveOperations.item.assigneeMembershipId")}
          value={shortIdentifier(item.assigneeMembershipId)}
        />
        <Fact
          label={t("liveOperations.item.trackingSessionId")}
          value={shortIdentifier(item.trackingSessionId)}
        />
        <Fact
          label={t("liveOperations.item.valetSessionId")}
          value={shortIdentifier(item.valetSessionId)}
        />
        <Fact
          label={t("liveOperations.item.vehicleId")}
          value={shortIdentifier(item.vehicle.vehicleId)}
        />
      </span>
    </button>
  );
}

function Fact({
  label,
  value,
  mono = true,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <span className="live-op-fact">
      <span className="live-op-fact-label">{label}</span>
      <span
        className={mono ? "live-op-fact-value cell-mono" : "live-op-fact-value"}
      >
        {value}
      </span>
    </span>
  );
}
