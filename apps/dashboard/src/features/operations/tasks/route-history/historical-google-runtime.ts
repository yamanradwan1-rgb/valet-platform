import type {
  GoogleAdvancedMarker,
  GoogleMap,
  GoogleMapsSdk,
} from "../../../../lib/maps/google-maps-sdk";
import type { Sample } from "./route-history-api";

interface HistoricalPolyline {
  setMap(map: GoogleMap | null): void;
}
type HistoricalSdk = GoogleMapsSdk & {
  Polyline: new (options: Record<string, unknown>) => HistoricalPolyline;
};

export function createHistoricalGoogleRuntime(input: {
  readonly sdk: GoogleMapsSdk;
  readonly node: HTMLElement;
  readonly mapId: string;
  readonly theme: "light" | "dark";
  readonly samples: Sample[];
  readonly markerClass: string;
  readonly label: (index: number) => string;
  readonly onSelect: (index: number) => void;
}) {
  const sdk = input.sdk as HistoricalSdk;
  if (typeof sdk.Polyline !== "function") throw new Error("Map unavailable");
  const map = new sdk.Map(input.node, {
    center: {
      lat: input.samples[0]!.latitude,
      lng: input.samples[0]!.longitude,
    },
    zoom: 17,
    mapId: input.mapId,
    colorScheme: input.theme === "dark" ? "DARK" : "LIGHT",
    disableDefaultUI: true,
    keyboardShortcuts: true,
    clickableIcons: false,
    gestureHandling: "cooperative",
  });
  let line: HistoricalPolyline | null = null;
  const markers: {
    marker: GoogleAdvancedMarker;
    button: HTMLButtonElement;
    click: () => void;
  }[] = [];
  let destroyed = false;
  const safely = (fn: () => void) => {
    try {
      fn();
    } catch {
      /* Provider teardown is best effort. */
    }
  };
  function clearMarkers() {
    for (const item of markers) {
      safely(() => {
        item.marker.map = null;
      });
      safely(() => sdk.event.clearInstanceListeners(item.marker));
      item.button.removeEventListener("click", item.click);
    }
    markers.length = 0;
  }
  function fit() {
    if (input.samples.length === 1) {
      map.setCenter({
        lat: input.samples[0]!.latitude,
        lng: input.samples[0]!.longitude,
      });
      map.setZoom(17);
      return;
    }
    const bounds = new sdk.LatLngBounds();
    for (const sample of input.samples)
      bounds.extend({ lat: sample.latitude, lng: sample.longitude });
    map.fitBounds(bounds, 48);
  }
  function select(selected: number) {
    if (destroyed) return;
    clearMarkers();
    const stride = Math.max(1, Math.ceil(input.samples.length / 28));
    const indexes = new Set([0, input.samples.length - 1, selected]);
    for (let i = stride; i < input.samples.length - 1; i += stride)
      indexes.add(i);
    for (const index of indexes) {
      const sample = input.samples[index]!;
      const button = document.createElement("button");
      button.type = "button";
      button.className = input.markerClass;
      button.setAttribute("aria-label", input.label(index));
      button.setAttribute("aria-pressed", String(index === selected));
      const endpoint =
        input.samples.length > 1 &&
        (index === 0 || index === input.samples.length - 1);
      button.dataset.endpoint = endpoint
        ? index === 0
          ? "start"
          : "end"
        : "point";
      const dot = document.createElement("span");
      dot.textContent = endpoint ? (index === 0 ? "A" : "B") : "";
      button.append(dot);
      const click = () => input.onSelect(index);
      button.addEventListener("click", click);
      const marker = new sdk.marker.AdvancedMarkerElement({
        map,
        position: { lat: sample.latitude, lng: sample.longitude },
        content: button,
        title: input.label(index),
      });
      markers.push({ marker, button, click });
    }
  }
  function destroy() {
    if (destroyed) return;
    destroyed = true;
    clearMarkers();
    if (line) {
      safely(() => line!.setMap(null));
      safely(() => sdk.event.clearInstanceListeners(line!));
    }
    safely(() => sdk.event.clearInstanceListeners(map));
    input.node.replaceChildren();
  }
  try {
    line = new sdk.Polyline({
      map,
      path: input.samples.map((sample) => ({
        lat: sample.latitude,
        lng: sample.longitude,
      })),
      geodesic: false,
      clickable: false,
      strokeColor: input.theme === "dark" ? "#6ca0ff" : "#176bff",
      strokeWeight: 3.5,
      strokeOpacity: 1,
      icons: [
        {
          icon: {
            path: "M -2,-2 0,0 -2,2",
            strokeColor: "#ffffff",
            strokeWeight: 2,
          },
          offset: "50px",
          repeat: "100px",
        },
      ],
    });
    fit();
  } catch (error) {
    destroy();
    throw error;
  }
  return {
    select,
    fit,
    destroy,
    zoom(delta: number) {
      map.setZoom(Math.max(1, Math.min(21, (map.getZoom() ?? 17) + delta)));
    },
  };
}
