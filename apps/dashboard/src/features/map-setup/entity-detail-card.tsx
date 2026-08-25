"use client";

import type { LocationMapArea, LocationMapPoint } from "@valet/contracts";

import { Card } from "../../components/ui/card";
import { DetailField } from "../../components/ui/list-detail-sheet";
import { areaPurposeLabelKey, pointKindLabelKey } from "../../i18n/enum-labels";
import { useTranslation } from "../../i18n/locale-provider";
import { formatTimestamp } from "../../lib/format/datetime-format";

interface EntityActions {
  readonly onEdit: () => void;
  readonly onReplaceVertices?: (() => void) | undefined;
  readonly onToggleActive: () => void;
}

export function PointDetailCard({
  point,
  actions,
}: {
  point: LocationMapPoint;
  actions: EntityActions;
}) {
  const { t, locale } = useTranslation();
  return (
    <Card>
      <div className="card-section-header">
        <h2>{t("mapSetup.detail.pointFields")}</h2>
        <div className="map-setup-card-actions">
          <button type="button" className="map-setup-link-button" onClick={actions.onEdit}>
            {t("mapSetup.action.edit")}
          </button>
          <button
            type="button"
            className={`map-setup-link-button${point.active ? " is-caution" : ""}`}
            onClick={actions.onToggleActive}
          >
            {point.active
              ? t("mapSetup.action.deactivate")
              : t("mapSetup.action.activate")}
          </button>
        </div>
      </div>
      <div className="detail-fields">
        <DetailField label={t("mapSetup.field.id")} value={point.id} mono />
        <DetailField label={t("mapSetup.field.code")} value={point.code} />
        <DetailField label={t("mapSetup.field.label")} value={point.label} />
        <DetailField
          label={t("mapSetup.field.kind")}
          value={t(pointKindLabelKey(point.kind))}
        />
        <DetailField
          label={t("mapSetup.field.latitude")}
          value={String(point.latitude)}
        />
        <DetailField
          label={t("mapSetup.field.longitude")}
          value={String(point.longitude)}
        />
        <DetailField
          label={t("mapSetup.field.levelLabel")}
          value={point.levelLabel ?? "—"}
        />
        <DetailField label={t("mapSetup.field.active")}>
          <ActiveStateBadge active={point.active} />
        </DetailField>
        <DetailField
          label={t("mapSetup.field.createdAt")}
          value={formatTimestamp(point.createdAt, locale)}
        />
        <DetailField
          label={t("mapSetup.field.updatedAt")}
          value={formatTimestamp(point.updatedAt, locale)}
        />
      </div>
    </Card>
  );
}

export function AreaDetailCard({
  area,
  actions,
}: {
  area: LocationMapArea;
  actions: EntityActions;
}) {
  const { t, locale } = useTranslation();
  const vertices = orderAreaVertices(area);
  return (
    <Card>
      <div className="card-section-header">
        <h2>{t("mapSetup.detail.areaFields")}</h2>
        <div className="map-setup-card-actions">
          <button type="button" className="map-setup-link-button" onClick={actions.onEdit}>
            {t("mapSetup.action.edit")}
          </button>
          <button
            type="button"
            className="map-setup-link-button"
            onClick={actions.onReplaceVertices}
          >
            {t("mapSetup.action.replaceVertices")}
          </button>
          <button
            type="button"
            className={`map-setup-link-button${area.active ? " is-caution" : ""}`}
            onClick={actions.onToggleActive}
          >
            {area.active
              ? t("mapSetup.action.deactivate")
              : t("mapSetup.action.activate")}
          </button>
        </div>
      </div>
      <div className="detail-fields">
        <DetailField label={t("mapSetup.field.id")} value={area.id} mono />
        <DetailField label={t("mapSetup.field.code")} value={area.code} />
        <DetailField label={t("mapSetup.field.label")} value={area.label} />
        <DetailField
          label={t("mapSetup.field.purpose")}
          value={t(areaPurposeLabelKey(area.purpose))}
        />
        <DetailField
          label={t("mapSetup.field.levelLabel")}
          value={area.levelLabel ?? "—"}
        />
        <DetailField
          label={t("mapSetup.field.parkingZoneId")}
          value={area.parkingZoneId ?? "—"}
          mono
        />
        <DetailField label={t("mapSetup.field.active")}>
          <ActiveStateBadge active={area.active} />
        </DetailField>
        <DetailField
          label={`${t("mapSetup.field.vertices")} · ${t(
            "mapSetup.state.verticesCountSuffix",
          )}`}
          value={String(area.vertices.length)}
        />
        <DetailField
          label={t("mapSetup.field.createdAt")}
          value={formatTimestamp(area.createdAt, locale)}
        />
        <DetailField
          label={t("mapSetup.field.updatedAt")}
          value={formatTimestamp(area.updatedAt, locale)}
        />
      </div>
      <div className="map-setup-vertex-box">
        {vertices.map((vertex) => (
          <div className="map-setup-vertex-row" key={vertex.position}>
            <span>#{vertex.position}</span>
            <span>
              {String(vertex.latitude)}, {String(vertex.longitude)}
            </span>
          </div>
        ))}
      </div>
      <p className="list-scope-hint">
        {t("mapSetup.detail.separateOperationsNote")}
      </p>
    </Card>
  );
}

function ActiveStateBadge({ active }: { active: boolean }) {
  const { t } = useTranslation();
  return (
    <span
      className={`status-badge status-badge-sm ${
        active ? "is-active-state" : "is-inactive-state"
      }`}
    >
      {active ? t("mapSetup.state.active") : t("mapSetup.state.inactive")}
    </span>
  );
}

/** Ascending authoritative position order for display. */
function orderAreaVertices(
  area: LocationMapArea,
): Array<{ latitude: number; longitude: number; position: number }> {
  return [...area.vertices].sort((left, right) => left.position - right.position);
}
