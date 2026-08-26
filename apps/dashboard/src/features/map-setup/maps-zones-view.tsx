"use client";

import {
  useCallback,
  useMemo,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { PageHeader } from "../../components/ui/page-header";
import { useTranslation } from "../../i18n/locale-provider";
import type { MapCenter, MapClick } from "../../lib/maps/map-provider";
import { useAuth } from "../auth/use-auth";
import { useDashboardLocation } from "../location/location-context";
import { ConfirmDialog } from "./confirm-dialog";
import { buildAreaPolygons, buildPointMarkers, mapSetupStats } from "./map-geometry";
import { setupFailureMessageKey } from "./map-setup-state";
import {
  resetTransientOnLocationChange,
  type DeactivateTarget,
  type EditorState,
} from "./map-setup-transient-state";
import { SetupBoard } from "./setup-board";
import { SetupMap } from "./setup-map";
import { useMapSetup } from "./use-map-setup";
import { MapSetupSheets } from "./editor-sheets";
import "./map-setup.css";

type Tab = "points" | "areas";

/**
 * /maps-zones orchestrator: real Map Setup CRUD against the verified backend
 * contracts, rendered around a provider-neutral interactive map.
 */
export function MapsZonesView() {
  const { client } = useAuth();
  const location = useDashboardLocation();
  const locationId = location?.locationId ?? "";
  const setup = useMapSetup(client, locationId);
  const { t } = useTranslation();

  const [tab, setTab] = useState<Tab>("points");
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<DeactivateTarget>(null);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pickedCoordinate, setPickedCoordinate] = useState<MapCenter | null>(null);

  // THE location-identity boundary for transient UI (semantics in
  // map-setup-transient-state.ts): the moment the requested location differs
  // from the one the current interaction state belongs to, every A-scoped
  // piece of transient UI — editors and their drafts, the deactivation
  // confirmation, selections, picked coordinate, A-raised errors — is
  // discarded synchronously during this render so B never paints an A fact.
  // Adjusting state during render is React's exactly-once pattern here.
  const [transientLocationId, setTransientLocationId] = useState(locationId);
  /** Committed-location mirror for async outcome ownership checks; a layout
   * effect keeps it exact BEFORE any pending promise continuation runs. */
  const activeLocationRef = useRef(locationId);
  useLayoutEffect(() => {
    activeLocationRef.current = locationId;
  }, [locationId]);
  if (transientLocationId !== locationId) {
    const neutral = resetTransientOnLocationChange(
      transientLocationId,
      locationId,
      {
        actionError,
        deactivateTarget,
        editor,
        pickedCoordinate,
        selectedAreaId,
        selectedPointId,
        sheetError,
      },
    );
    setTransientLocationId(locationId);
    setSelectedAreaId(neutral.selectedAreaId);
    setSelectedPointId(neutral.selectedPointId);
    setEditor(neutral.editor);
    setDeactivateTarget(neutral.deactivateTarget);
    setPickedCoordinate(neutral.pickedCoordinate);
    setActionError(neutral.actionError);
    setSheetError(neutral.sheetError);
  }

  const data = setup.state.phase === "ready" ? setup.state.data : null;
  const points = useMemo(() => data?.points ?? [], [data]);
  const areas = useMemo(() => data?.areas ?? [], [data]);
  const stats = mapSetupStats(points, areas);

  const markers = useMemo(
    () => buildPointMarkers(points, selectedPointId),
    [points, selectedPointId],
  );
  const polygons = useMemo(
    () => buildAreaPolygons(areas, selectedAreaId),
    [areas, selectedAreaId],
  );

  const handleMapClick = useCallback((click: MapClick) => {
    if (click.markerId !== null) {
      setTab("points");
      setSelectedPointId(click.markerId);
      return;
    }
    if (click.polygonId !== null) {
      setTab("areas");
      setSelectedAreaId(click.polygonId);
      return;
    }
    setPickedCoordinate(click.coordinate);
  }, []);

  const closeEditor = useCallback(() => {
    setEditor(null);
    setSheetError(null);
    setPickedCoordinate(null);
  }, []);

  // Mutation outcomes are owned by the location they were invoked for: each
  // runner stamps the committed location synchronously at invocation and
  // ignores its own late settlement after a switch — a Location-A response
  // may still succeed server-side, but under B it can neither close/reset UI
  // nor present A success/error text as B state. Request identity/race
  // protection inside use-map-setup remains untouched and authoritative.
  const runSheetMutation = async (action: () => Promise<unknown>): Promise<void> => {
    const invokedFor = activeLocationRef.current;
    setSheetError(null);
    try {
      await action();
      if (activeLocationRef.current === invokedFor) closeEditor();
    } catch (error) {
      if (activeLocationRef.current !== invokedFor) return;
      setSheetError(t(setupFailureMessageKey(error)));
    }
  };

  const runActionMutation = async (action: () => Promise<unknown>): Promise<void> => {
    const invokedFor = activeLocationRef.current;
    setActionError(null);
    try {
      await action();
    } catch (error) {
      if (activeLocationRef.current !== invokedFor) return;
      setActionError(t(setupFailureMessageKey(error)));
    }
  };

  function requestToggleActive(action: {
    kind: "point" | "area";
    id: string;
    active: boolean;
  }): void {
    if (action.active) {
      // Deactivation changes operational visibility -> explicit confirmation.
      setDeactivateTarget({ kind: action.kind, id: action.id });
      return;
    }
    void runActionMutation(() =>
      action.kind === "point"
        ? setup.updatePoint(action.id, { active: true })
        : setup.updateArea(action.id, { active: true }),
    );
  }

  return (
    <div className="page-shell">
      <PageHeader
        description={t("page.mapsZones.description")}
        title={t("page.mapsZones.title")}
        actions={
          <button
            type="button"
            className="btn-primary"
            disabled={locationId.length === 0}
            onClick={() =>
              setEditor(
                tab === "points"
                  ? { type: "point.create" }
                  : { type: "area.create" },
              )
            }
          >
            {tab === "points"
              ? t("mapSetup.action.addPoint")
              : t("mapSetup.action.addArea")}
          </button>
        }
      />
      <p className="contract-note">{t("mapSetup.note")}</p>
      <p className="list-scope-hint">{t("mapSetup.viewportNote")}</p>

      <SetupMap
        ariaLabel={t("mapSetup.map.ariaLabel")}
        markers={markers}
        polygons={polygons}
        onMapClick={handleMapClick}
      />

      {(setup.refreshFailed || actionError !== null) && (
        <div className="map-setup-refresh-banner" role="status">
          <span>
            {actionError !== null
              ? actionError
              : t("mapSetup.refresh.failed")}
          </span>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              if (actionError !== null) setActionError(null);
              else {
                setup.dismissRefreshFailure();
                setup.reload();
              }
            }}
          >
            {actionError !== null ? t("common.close") : t("common.retry")}
          </button>
        </div>
      )}

      <SetupBoard
        areas={areas}
        errorPhase={setup.state.phase === "error" ? setup.state.error : null}
        loading={setup.state.phase === "loading"}
        onOpenAreaFields={(area) => setEditor({ type: "area.fields", area })}
        onOpenPointEdit={(point) => setEditor({ type: "point.edit", point })}
        onOpenVertices={(area) => setEditor({ type: "area.vertices", area })}
        onRetry={setup.reload}
        onSelectArea={(id) => {
          setSelectedAreaId(id);
          setTab("areas");
        }}
        onSelectPoint={(id) => {
          setSelectedPointId(id);
          setTab("points");
        }}
        onSetTab={setTab}
        onToggleActiveRequest={requestToggleActive}
        points={points}
        selectedAreaId={selectedAreaId}
        selectedPointId={selectedPointId}
        stats={stats}
        tab={tab}
      />

      <MapSetupSheets
        areas={areas}
        editor={editor}
        onClose={closeEditor}
        onCreateArea={(request) =>
          void runSheetMutation(() => setup.createArea(request))
        }
        onCreatePoint={(request) =>
          void runSheetMutation(() => setup.createPoint(request))
        }
        onReplaceVertices={(id, request) =>
          void runSheetMutation(() => setup.replaceVertices(id, request))
        }
        onUpdateArea={(id, patch) =>
          void runSheetMutation(() => setup.updateArea(id, patch))
        }
        onUpdatePoint={(id, patch) =>
          void runSheetMutation(() => setup.updatePoint(id, patch))
        }
        pendingOperation={setup.pendingOperation}
        pickedCoordinate={pickedCoordinate}
        points={points}
        sheetError={sheetError}
      />

      {deactivateTarget !== null && (
        <ConfirmDialog
          busy={setup.pendingOperation !== null}
          body={t("mapSetup.confirm.deactivateBody")}
          title={t("mapSetup.confirm.deactivateTitle")}
          onCancel={() => setDeactivateTarget(null)}
          onConfirm={() => {
            const target = deactivateTarget;
            if (target === null) return;
            setDeactivateTarget(null);
            void runActionMutation(() =>
              target.kind === "point"
                ? setup.updatePoint(target.id, { active: false })
                : setup.updateArea(target.id, { active: false }),
            );
          }}
        />
      )}
    </div>
  );
}
