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
import { PointEditorDialog } from "./point-editor-dialog";
import { useMapSetupMutation } from "./use-map-setup-mutation";
import type { MapSetupReloadResult } from "./use-map-setup-state";

export function MapSetupPanel(props: {
  readonly api: DashboardApiClient;
  readonly areas: readonly LocationMapArea[];
  readonly error: Error | null;
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
    <section className={styles.card} aria-label={t.mapSetup}>
      <div className={styles.mapSidebar}>
        <div className={styles.toolbar}><h2>{t.mapSetup}</h2><button className={styles.secondary} disabled={mutation.pending} onClick={() => void props.reload()} type="button">{t.refresh}</button></div>
        {notice ? <div className={styles.setupStatus} role="status">{notice}</div> : null}
        {mutation.error ? <div className={styles.error} role="alert">{mutation.error}</div> : null}
        <ReadState error={props.error} loading={props.loading} onRetry={() => void props.reload()}>
          <SetupSection actionLabel={t.addPoint} onAdd={() => setPointEditor("new")} title={t.points}>
            {props.points.length === 0 ? <div className={styles.muted}>{t.noData}</div> : props.points.map((point) => (
              <button className={styles.listItem} key={point.id} onClick={() => setPointEditor(point)} type="button">
                <div className={styles.toolbar}><strong>{point.label}</strong><StatusBadge tone={point.active ? "good" : "neutral"}>{point.kind}</StatusBadge></div>
                <div className={styles.muted}><bdi dir="ltr">{point.code} · {point.latitude}, {point.longitude}</bdi></div>
              </button>
            ))}
          </SetupSection>
          <SetupSection actionLabel={t.addArea} onAdd={() => setAreaEditor("new")} title={t.areas}>
            {props.areas.length === 0 ? <div className={styles.muted}>{t.noData}</div> : props.areas.map((area) => (
              <div className={styles.listItem} key={area.id}>
                <div className={styles.toolbar}><button className={styles.quiet} onClick={() => setAreaEditor(area)} type="button"><strong>{area.label}</strong></button><StatusBadge tone={area.active ? "info" : "neutral"}>{area.purpose}</StatusBadge></div>
                <div className={styles.muted}><bdi dir="ltr">{area.code}</bdi> · {area.vertices.length} {t.vertices}</div>
                <button className={styles.secondary} onClick={() => setVerticesEditor(area)} type="button">{t.replaceVertices}</button>
              </div>
            ))}
          </SetupSection>
        </ReadState>
      </div>
      {pointEditor ? <PointEditorDialog onClose={() => setPointEditor(null)} onSave={savePoint} pending={mutation.pending} point={pointEditor === "new" ? undefined : pointEditor} /> : null}
      {areaEditor ? <AreaEditorDialog area={areaEditor === "new" ? undefined : areaEditor} onClose={() => setAreaEditor(null)} onSave={saveArea} pending={mutation.pending} /> : null}
      {verticesEditor ? <VerticesEditorDialog area={verticesEditor} onClose={() => setVerticesEditor(null)} onSave={saveVertices} pending={mutation.pending} /> : null}
    </section>
  );
}

function SetupSection(props: {
  readonly actionLabel: string;
  readonly children: React.ReactNode;
  readonly onAdd: () => void;
  readonly title: string;
}) {
  return <section><div className={styles.toolbar}><h3 className={styles.sectionTitle}>{props.title}</h3><button className={styles.primary} onClick={props.onAdd} type="button"><Plus size={14} /> {props.actionLabel}</button></div><div className={styles.list}>{props.children}</div></section>;
}
