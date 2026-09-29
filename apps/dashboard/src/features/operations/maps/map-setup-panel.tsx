"use client";

import type {
  CreateLocationMapAreaRequest,
  CreateLocationMapPointRequest,
  LocationMapArea,
  LocationMapPoint,
  ReplaceLocationMapAreaVerticesRequest,
  UpdateLocationMapAreaRequest,
  UpdateLocationMapPointRequest,
} from "@valet/contracts";
import { Plus } from "lucide-react";
import { useState } from "react";

import type { DashboardApiClient } from "../../../lib/api/dashboard-api-client";
import { useDashboardLocale } from "../../../lib/i18n/locale-provider";
import {
  createMapArea, createMapPoint, replaceMapAreaVertices, updateMapArea, updateMapPoint,
} from "../map-setup-api";
import { operationsCopy } from "../operations-copy";
import { ReadState, StatusBadge, styles } from "../operations-ui";
import { AreaEditorDialog, VerticesEditorDialog } from "./area-editor-dialog";
import { mapAreaPurposeLabel, mapPointKindLabel } from "./map-setup-presentation";
import reference from "./maps-reference.module.css";
import { PointEditorDialog } from "./point-editor-dialog";
import { useMapSetupMutation } from "./use-map-setup-mutation";
import { useMapParkingZones } from "./use-map-parking-zones";
import type { MapSetupReloadResult } from "./use-map-setup-state";

export function MapSetupPanel(props: {
  readonly api: DashboardApiClient;
  readonly areas: readonly LocationMapArea[];
  readonly error: Error | null;
  readonly hidden?: boolean;
  readonly loading: boolean;
  readonly locationId: string;
  readonly points: readonly LocationMapPoint[];
  readonly reload: () => Promise<MapSetupReloadResult>;
}) {
  const { locale } = useDashboardLocale();
  const t = operationsCopy(locale);
  const [pointEditor, setPointEditor] = useState<LocationMapPoint | "new" | null>(null);
  const [areaEditor, setAreaEditor] = useState<LocationMapArea | "new" | null>(null);
  const [verticesEditor, setVerticesEditor] = useState<LocationMapArea | null>(null);
  const mutation = useMapSetupMutation(props.reload);
  const zones = useMapParkingZones(props.api, props.locationId, !props.hidden);
  const notice = mutation.notice === "saved_refresh_failed" ? t.savedRefreshFailed
    : mutation.notice === "conflict_reloaded" ? t.conflictReloaded
    : mutation.notice === "conflict_reload_failed" ? t.conflictReloadFailed
    : mutation.notice === "unknown_reloaded" ? t.unknownReloaded
    : mutation.notice === "unknown_reload_failed" ? t.unknownReloadFailed
    : mutation.notice === "retry_reloaded" ? t.retryReloaded
    : mutation.notice === "retry_reload_failed" ? t.retryReloadFailed : null;

  async function savePoint(value: CreateLocationMapPointRequest | UpdateLocationMapPointRequest) {
    return mutation.run(() => pointEditor === "new"
      ? createMapPoint(props.api, props.locationId, value as CreateLocationMapPointRequest)
      : updateMapPoint(props.api, props.locationId, (pointEditor as LocationMapPoint).id, value as UpdateLocationMapPointRequest));
  }
  async function saveArea(value: CreateLocationMapAreaRequest | UpdateLocationMapAreaRequest) {
    return mutation.run(() => areaEditor === "new"
      ? createMapArea(props.api, props.locationId, value as CreateLocationMapAreaRequest)
      : updateMapArea(props.api, props.locationId, (areaEditor as LocationMapArea).id, value as UpdateLocationMapAreaRequest));
  }
  async function saveVertices(value: ReplaceLocationMapAreaVerticesRequest) {
    if (!verticesEditor) return false;
    return mutation.run(() => replaceMapAreaVertices(props.api, props.locationId, verticesEditor.id, value));
  }

  return (
    <aside className={reference.panel} aria-label={t.mapSetup} hidden={props.hidden} role="region">
      <div className={reference.panelHeader}>
        <h2>{t.zonesAreas}</h2>
        <span className={reference.panelCount}>{props.points.length + props.areas.length}</span>
      </div>
      <div className={reference.panelBody}>
        <div className={reference.panelActions}>
          <button className={styles.secondary} disabled={mutation.pending} onClick={() => void props.reload()} type="button">{t.refresh}</button>
        </div>
        {notice ? <div className={styles.setupStatus} role="status">{notice}</div> : null}
        {mutation.error ? <div className={styles.error} role="alert">{mutation.error}</div> : null}
        <ReadState error={props.error} loading={props.loading} onRetry={() => void props.reload()}>
          <SetupSection actionLabel={t.addPoint} onAdd={() => setPointEditor("new")} title={t.points}>
            {props.points.length === 0 ? <div className={styles.muted}>{t.noData}</div> : props.points.map((point) => (
              <div className={reference.setupRow} key={point.id}>
                <div className={reference.setupRowTop}>
                  <strong>{point.label}</strong>
                  <StatusBadge tone={point.active ? "good" : "neutral"}>{point.active ? t.active : t.inactive}</StatusBadge>
                </div>
                <div className={reference.setupRowMeta}>
                  <span>{t.kind}: {mapPointKindLabel(point.kind, locale)}</span>
                  <span>{t.code}: <bdi dir="ltr">{point.code}</bdi></span>
                  {point.levelLabel ? <span>{t.level}: {point.levelLabel}</span> : null}
                </div>
                <div className={reference.panelActions}>
                  <button aria-label={`${t.edit}: ${point.label}`} className={styles.secondary} onClick={() => setPointEditor(point)} type="button">{t.edit}</button>
                </div>
              </div>
            ))}
          </SetupSection>
          <SetupSection actionLabel={t.addArea} onAdd={() => setAreaEditor("new")} title={t.areas}>
            {props.areas.length === 0 ? <div className={styles.muted}>{t.noData}</div> : props.areas.map((area) => (
              <div className={reference.setupRow} key={area.id}>
                <div className={reference.setupRowTop}>
                  <strong>{area.label}</strong>
                  <StatusBadge tone={area.active ? "good" : "neutral"}>{area.active ? t.active : t.inactive}</StatusBadge>
                </div>
                <div className={reference.setupRowMeta}>
                  <span>{t.purpose}: {mapAreaPurposeLabel(area.purpose, locale)}</span>
                  <span>{t.code}: <bdi dir="ltr">{area.code}</bdi></span>
                  {area.levelLabel ? <span>{t.level}: {area.levelLabel}</span> : null}
                  <span>{t.boundaryPoints}: {area.vertices.length}</span>
                </div>
                <div className={reference.panelActions}>
                  <button aria-label={`${t.edit}: ${area.label}`} className={styles.secondary} onClick={() => setAreaEditor(area)} type="button">{t.edit}</button>
                  <button aria-label={`${t.editBoundary}: ${area.label}`} className={styles.secondary} onClick={() => setVerticesEditor(area)} type="button">{t.editBoundary}</button>
                </div>
              </div>
            ))}
          </SetupSection>
        </ReadState>
      </div>
      {pointEditor ? <PointEditorDialog onClose={() => setPointEditor(null)} onSave={savePoint} pending={mutation.pending} point={pointEditor === "new" ? undefined : pointEditor} /> : null}
      {areaEditor ? <AreaEditorDialog
        area={areaEditor === "new" ? undefined : areaEditor}
        onClose={() => setAreaEditor(null)}
        onParkingZonesNext={zones.next}
        onParkingZonesPrevious={zones.previous}
        onSave={saveArea}
        parkingZones={zones.items}
        parkingZonesCanNext={zones.canNext}
        parkingZonesCanPrevious={zones.canPrevious}
        parkingZonesError={zones.error}
        parkingZonesLoading={zones.loading}
        pending={mutation.pending}
      /> : null}
      {verticesEditor ? <VerticesEditorDialog area={verticesEditor} onClose={() => setVerticesEditor(null)} onSave={saveVertices} pending={mutation.pending} /> : null}
    </aside>
  );
}

function SetupSection(props: {
  readonly actionLabel: string;
  readonly children: React.ReactNode;
  readonly onAdd: () => void;
  readonly title: string;
}) {
  return (
    <section className={reference.setupSection}>
      <div className={reference.setupSectionHeader}>
        <h3>{props.title}</h3>
        <button className={styles.primary} onClick={props.onAdd} type="button"><Plus aria-hidden="true" size={14} /> {props.actionLabel}</button>
      </div>
      {props.children}
    </section>
  );
}
