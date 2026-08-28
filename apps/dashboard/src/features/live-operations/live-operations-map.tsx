"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { useTranslation } from "../../i18n/locale-provider";
import { createActiveMapProvider } from "../../lib/maps/active-map-provider";
import {
  supportsMarkers,
  type MapInstance,
  type MapInitOptions,
  type MapMarkerDescriptor,
} from "../../lib/maps/map-provider";
import { createMapController } from "../../lib/maps/map-lifecycle";
import { computeMapViewport } from "../../lib/maps/map-viewport";

type MapStatus = "loading" | "ready" | "failed" | "unsupported";

interface LiveOperationsMapProps {
  /** Provider-neutral drafts; aria labels are resolved here, localized. */
  markers: readonly Omit<MapMarkerDescriptor, "ariaLabel">[];
  /** Composes the localized accessible name for one marker draft. */
  describeMarker: (marker: Omit<MapMarkerDescriptor, "ariaLabel">) => string;
  selectedMarkerId: string | null;
  onSelectMarker: (markerId: string) => void;
  /**
   * Authority-scope key. When this value changes the established
   * viewport is cleared and a fresh instance is initialized from the
   * next non-empty marker snapshot. Server authorization remains
   * authoritative; this is purely a client-side viewport-reset signal.
   */
  locationId: string;
}

/**
 * World-only fallback used when the snapshot is empty. NOT a Location
 * center — it is the natural no-bias view so subsequent snapshots can
 * establish the viewport from real coordinates when they arrive. The
 * empty-state overlay above the canvas is the honest UX.
 */
const NO_GEOMETRY_CENTER = { latitude: 0, longitude: 0 } as const;
const NO_GEOMETRY_ZOOM = 1;

/** See setup-map.tsx for the rationale behind quantization. */
function quantize(value: number): string {
  return value.toFixed(6);
}

function hasPositionedMarker(
  markers: readonly Omit<MapMarkerDescriptor, "ariaLabel">[],
): boolean {
  for (const marker of markers) {
    if (
      Number.isFinite(marker.latitude) &&
      Number.isFinite(marker.longitude) &&
      marker.latitude >= -90 &&
      marker.latitude <= 90 &&
      marker.longitude >= -180 &&
      marker.longitude <= 180
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Live Operations map panel.
 *
 * The authoritative viewport is established ONCE per active Location,
 * from the first non-empty valid marker snapshot. Before the first
 * snapshot arrives the map mounts at a world-only fallback; after
 * establishment the viewport is frozen and later marker updates render
 * in place WITHOUT re-panning the manager's manual viewport. Location
 * changes always reset viewport establishment — there is no per-id
 * cache, so A → B → A always starts with the pending fallback and
 * re-establishes A from the first fresh snapshot.
 *
 * D6-004B: every freshly adopted instance is initialized with the
 * CURRENT markers through `controller.pushData`. Marker updates and
 * click-handler swaps also use the same push path; the controller
 * owns the instance's data and the component does not race its
 * `instanceRef` against the controller's `currentInstance`.
 */
export function LiveOperationsMap({
  markers,
  describeMarker,
  selectedMarkerId,
  onSelectMarker,
  locationId,
}: LiveOperationsMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<ReturnType<typeof createMapController> | null>(
    null,
  );
  const instanceRef = useRef<MapInstance | null>(null);
  // The current callback for the controller. A ref keeps the ensure
  // effect's closure stable so it does not churn on callback identity
  // changes; controller.pushData is invoked from a dedicated effect.
  const onSelectMarkerRef = useRef(onSelectMarker);
  // The latest marker set; read by the post-ensure push so the freshly
  // adopted instance is always initialized with the current data.
  const markersRef = useRef<readonly MapMarkerDescriptor[]>([]);
  // The latest selected marker; read by the focus effect below.
  const selectedMarkerIdRef = useRef(selectedMarkerId);
  const [status, setStatus] = useState<MapStatus>("loading");
  const { t } = useTranslation();
  const descriptors = useMemo<readonly MapMarkerDescriptor[]>(
    () => markers.map((marker) => ({ ...marker, ariaLabel: describeMarker(marker) })),
    [markers, describeMarker],
  );

  useEffect(() => {
    onSelectMarkerRef.current = onSelectMarker;
  }, [onSelectMarker]);
  useEffect(() => {
    markersRef.current = descriptors;
  }, [descriptors]);
  useEffect(() => {
    selectedMarkerIdRef.current = selectedMarkerId;
  }, [selectedMarkerId]);

  // The authoritative viewport for the ACTIVE Location. The
  // `forLocationId` field is part of the state so the establishment
  // check below can compare against the active Location without
  // touching a ref. There is intentionally no per-locationId cache:
  // A → B → A must start pending on the return leg so A's first
  // fresh snapshot re-establishes the viewport.
  type ViewportSnapshot = {
    readonly center: { readonly latitude: number; readonly longitude: number };
    readonly zoom: number;
  };
  type LocatedViewport = ViewportSnapshot & { readonly forLocationId: string };
  const [locatedViewport, setLocatedViewport] = useState<LocatedViewport | null>(
    null,
  );
  const [activeLocationId, setActiveLocationId] = useState(locationId);
  if (activeLocationId !== locationId) {
    setActiveLocationId(locationId);
    setLocatedViewport(null);
  }
  const establishedViewport: ViewportSnapshot | null =
    locatedViewport !== null && locatedViewport.forLocationId === locationId
      ? locatedViewport
      : null;

  // Establish the authoritative viewport the moment a non-empty valid
  // marker snapshot appears for the current Location. React's
  // documented "adjust state during render" pattern. Comparing
  // `locatedViewport` against the active `locationId` keeps a stale
  // snapshot arriving after a Location switch from silently
  // re-establishing the old Location's viewport.
  if (establishedViewport === null && hasPositionedMarker(markers)) {
    const derived = computeMapViewport({ points: markers, polygons: [] });
    if (derived !== null) {
      setLocatedViewport({
        center: derived.center,
        forLocationId: locationId,
        zoom: derived.zoom,
      });
    }
  }

  const activeCenter = establishedViewport?.center ?? NO_GEOMETRY_CENTER;
  const activeZoom = establishedViewport?.zoom ?? NO_GEOMETRY_ZOOM;
  const establishedFor = establishedViewport === null ? "pending" : "set";
  const viewportKey =
    `${locationId}|${establishedFor}|` +
    `${quantize(activeCenter.latitude)}|` +
    `${quantize(activeCenter.longitude)}|` +
    `${String(activeZoom)}`;

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;
    if (controllerRef.current === null) {
      const adapter = createActiveMapProvider();
      controllerRef.current = createMapController({
        adapter,
        getContainer: () => containerRef.current,
      });
    }
    const controller = controllerRef.current;
    let cancelled = false;
    setStatus("loading");
    const initOptions: MapInitOptions = {
      center: activeCenter,
      onSelectMarker: (id) => onSelectMarkerRef.current(id),
      zoom: activeZoom,
    };
    controller
      .ensure(viewportKey, initOptions)
      .then((decision) => {
        if (cancelled) return;
        if (decision.kind === "noop-disposed" || decision.kind === "noop-stale") {
          setStatus("failed");
          return;
        }
        instanceRef.current = decision.instance;
        // Push the CURRENT markers onto the freshly adopted instance.
        // For Live Operations this is a marker-capable instance so the
        // InteractiveMapInstance path applies; for non-marker providers
        // pushData is a no-op.
        controller.pushData({ liveMarkers: markersRef.current });
        setStatus(supportsMarkers(decision.instance) ? "ready" : "unsupported");
      })
      .catch(() => {
        if (!cancelled) setStatus("failed");
      });
    return () => {
      cancelled = true;
    };
    // The controller owns instance lifecycle. Markers and the
    // select-marker callback are pushed through a single path
    // (controller.pushData) so the component does not race its
    // instanceRef against the controller's currentInstance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewportKey]);

  // The controller is created once and disposed exactly on unmount.
  useEffect(() => {
    return () => {
      controllerRef.current?.dispose();
      controllerRef.current = null;
      instanceRef.current = null;
    };
  }, []);

  // Push the latest marker set whenever it changes — the controller
  // will forward it to whichever instance is currently owned.
  useEffect(() => {
    const controller = controllerRef.current;
    if (controller === null) return;
    controller.pushData({ liveMarkers: descriptors });
  }, [descriptors]);

  // The focus effect is the only remaining direct instance use, and
  // it is gated by both `supportsMarkers` and a non-null `instanceRef`.
  useEffect(() => {
    const instance = instanceRef.current;
    if (selectedMarkerId === null || instance === null) return;
    if (!supportsMarkers(instance)) return;
    instance.focusMarker(selectedMarkerId);
  }, [selectedMarkerId, status]);

  return (
    <div
      className="map-container"
      role="region"
      aria-label={t("liveOperations.map.title")}
    >
      <div ref={containerRef} className="map-canvas" />
      {status === "loading" && (
        <div className="map-overlay" role="status">
          {t("map.loading")}
        </div>
      )}
      {status === "failed" && (
        <div className="map-overlay is-error" role="alert">
          {t("map.failed")}
        </div>
      )}
      {status === "ready" && descriptors.length === 0 && (
        <div className="map-overlay" role="status">
          {t("liveOperations.map.emptyNoPositions")}
        </div>
      )}
      <div className="live-map-legend">
        <span className="live-map-legend-item">
          <span className="legend-dot is-live" aria-hidden="true" />
          {t("enum.freshness.LIVE")}
        </span>
        <span className="live-map-legend-item">
          <span className="legend-dot is-stale" aria-hidden="true" />
          {t("enum.freshness.STALE")}
        </span>
        <span className="live-map-legend-item">
          <span className="legend-glyph" aria-hidden="true">P</span>
          {t("enum.taskType.PARKING")}
        </span>
        <span className="live-map-legend-item">
          <span className="legend-glyph" aria-hidden="true">R</span>
          {t("enum.taskType.RETRIEVAL")}
        </span>
      </div>
    </div>
  );
}
