"use client";

import type { DashboardApiError } from "../../lib/api/api-error";
import type { LocationMapArea, LocationMapPoint } from "@valet/contracts";

import { Card } from "../../components/ui/card";
import { EmptyState, ErrorState } from "../../components/ui/empty-state";
import {
  areaPurposeLabelKey,
  pointKindLabelKey,
} from "../../i18n/enum-labels";
import { useTranslation } from "../../i18n/locale-provider";
import { mapSetupStats } from "./map-geometry";
import { setupFailureMessageKey } from "./map-setup-state";
import { AreaDetailCard, PointDetailCard } from "./entity-detail-card";

export interface SetupBoardEntityAction {
  readonly kind: "point" | "area";
  readonly id: string;
  readonly active: boolean;
}

export interface SetupBoardProps {
  readonly loading: boolean;
  readonly errorPhase: DashboardApiError | null;
  readonly tab: "points" | "areas";
  readonly points: readonly LocationMapPoint[];
  readonly areas: readonly LocationMapArea[];
  readonly selectedPointId: string | null;
  readonly selectedAreaId: string | null;
  readonly stats: ReturnType<typeof mapSetupStats>;
  readonly onRetry: () => void;
  readonly onSetTab: (tab: "points" | "areas") => void;
  readonly onSelectPoint: (id: string) => void;
  readonly onSelectArea: (id: string) => void;
  readonly onOpenPointEdit: (point: LocationMapPoint) => void;
  readonly onOpenAreaFields: (area: LocationMapArea) => void;
  readonly onOpenVertices: (area: LocationMapArea) => void;
  readonly onToggleActiveRequest: (action: SetupBoardEntityAction) => void;
}

/**
 * The list/detail board under the map: KPI strip, Points/Areas tabs, the
 * selectable entry lists and the authoritative-field detail cards.
 */
export function SetupBoard(props: SetupBoardProps) {
  const { t } = useTranslation();

  if (props.loading) {
    return (
      <div className="map-setup-loading" role="status">
        {t("states.loading")}
      </div>
    );
  }

  if (props.errorPhase !== null) {
    return (
      <ErrorState
        message={t(setupFailureMessageKey(props.errorPhase))}
        retryLabel={t("common.retry")}
        onRetry={props.onRetry}
      />
    );
  }

  const bothEmpty = props.points.length === 0 && props.areas.length === 0;

  return (
    <>
      <div className="overview-kpi-grid is-sm-four">
        <Kpi label={t("mapSetup.kpi.points")} value={props.stats.pointsTotal} />
        <Kpi
          label={t("mapSetup.kpi.activePoints")}
          value={props.stats.activePoints}
        />
        <Kpi label={t("mapSetup.kpi.areas")} value={props.stats.areasTotal} />
        <Kpi
          label={t("mapSetup.kpi.activeAreas")}
          value={props.stats.activeAreas}
        />
      </div>

      <div className="filter-chip-row">
        <button
          type="button"
          aria-pressed={props.tab === "points"}
          className="filter-chip"
          onClick={() => props.onSetTab("points")}
        >
          {t("mapSetup.tab.points")}
        </button>
        <button
          type="button"
          aria-pressed={props.tab === "areas"}
          className="filter-chip"
          onClick={() => props.onSetTab("areas")}
        >
          {t("mapSetup.tab.areas")}
        </button>
      </div>

      {bothEmpty ? (
        <EmptyState message={t("mapSetup.empty.all")} />
      ) : props.tab === "points" ? (
        <PointsColumn {...props} />
      ) : (
        <AreasColumn {...props} />
      )}
    </>
  );
}

function PointsColumn(props: SetupBoardProps) {
  const { t } = useTranslation();
  if (props.points.length === 0) {
    return <EmptyState message={t("mapSetup.empty.points")} />;
  }
  const selected =
    props.points.find((point) => point.id === props.selectedPointId) ?? null;
  return (
    <div className="map-setup-grid">
      <Card>
        <SectionHeader title={t("mapSetup.list.pointsTitle")} />
        <div className="map-setup-row-list">
          {props.points.map((point) => (
            <RowButton
              key={point.id}
              selected={point.id === props.selectedPointId}
              title={point.label}
              subtitle={`${t(pointKindLabelKey(point.kind))} · ${point.code}`}
              active={point.active}
              onSelect={() => props.onSelectPoint(point.id)}
            />
          ))}
        </div>
      </Card>
      {selected !== null ? (
        <PointDetailCard
          point={selected}
          actions={{
            onEdit: () => props.onOpenPointEdit(selected),
            onToggleActive: () =>
              props.onToggleActiveRequest({
                active: selected.active,
                id: selected.id,
                kind: "point",
              }),
          }}
        />
      ) : (
        <DetailPlaceholder />
      )}
    </div>
  );
}

function AreasColumn(props: SetupBoardProps) {
  const { t } = useTranslation();
  if (props.areas.length === 0) {
    return <EmptyState message={t("mapSetup.empty.areas")} />;
  }
  const selected =
    props.areas.find((area) => area.id === props.selectedAreaId) ?? null;
  return (
    <div className="map-setup-grid">
      <Card>
        <SectionHeader title={t("mapSetup.list.areasTitle")} />
        <div className="map-setup-row-list">
          {props.areas.map((area) => (
            <RowButton
              key={area.id}
              selected={area.id === props.selectedAreaId}
              title={area.label}
              subtitle={`${t(areaPurposeLabelKey(area.purpose))} · ${area.code} · ${
                area.vertices.length
              } ${t("mapSetup.state.verticesCountSuffix")}`}
              active={area.active}
              onSelect={() => props.onSelectArea(area.id)}
            />
          ))}
        </div>
      </Card>
      {selected !== null ? (
        <AreaDetailCard
          area={selected}
          actions={{
            onEdit: () => props.onOpenAreaFields(selected),
            onReplaceVertices: () => props.onOpenVertices(selected),
            onToggleActive: () =>
              props.onToggleActiveRequest({
                active: selected.active,
                id: selected.id,
                kind: "area",
              }),
          }}
        />
      ) : (
        <DetailPlaceholder />
      )}
    </div>
  );
}

function RowButton(props: {
  selected: boolean;
  title: string;
  subtitle: string;
  active: boolean;
  onSelect: () => void;
}) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      className={`map-setup-row${props.selected ? " is-selected" : ""}`}
      onClick={props.onSelect}
    >
      <span className="map-setup-row-text">
        <span className="cell-primary">{props.title}</span>
        <span className="map-setup-row-sub">{props.subtitle}</span>
      </span>
      <span
        className={`status-badge status-badge-sm ${
          props.active ? "is-active-state" : "is-inactive-state"
        }`}
      >
        {props.active
          ? t("mapSetup.state.active")
          : t("mapSetup.state.inactive")}
      </span>
    </button>
  );
}

function DetailPlaceholder() {
  const { t } = useTranslation();
  return (
    <Card className="map-setup-detail-empty">
      <p>{t("mapSetup.detail.noneSelected")}</p>
    </Card>
  );
}

function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <div className="card">
      <p className="overview-kpi-label">{label}</p>
      <p className="overview-kpi-value">{value}</p>
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="card-section-header">
      <h2>{title}</h2>
    </div>
  );
}
