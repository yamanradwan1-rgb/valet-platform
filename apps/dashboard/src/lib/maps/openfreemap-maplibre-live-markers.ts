import type { Marker } from "maplibre-gl";

import type { MapMarkerDescriptor } from "./map-provider";

/**
 * Live-marker capability plumbing for the OpenFreeMap/MapLibre adapter
 * (D3-001, extracted to keep the adapter within the physical-line policy).
 *
 * Live Operations markers are accessible DOM buttons owned by the adapter's
 * per-instance registry so replacement and disposal always detach every
 * element.
 */

/** One live marker tracked by the adapter registry until replaced/disposed. */
export interface RenderedMarker {
  readonly marker: Marker;
  readonly element: HTMLButtonElement;
  readonly descriptor: MapMarkerDescriptor;
}

/** Builds the accessible button element for one live marker descriptor. */
export function createMarkerElement(
  descriptor: MapMarkerDescriptor,
  onSelectMarker: ((markerId: string) => void) | undefined,
): HTMLButtonElement {
  const element = document.createElement("button");
  element.type = "button";
  element.className = "live-op-marker";
  element.classList.add(
    descriptor.tone === "positive" ? "is-live" : "is-stale",
  );
  if (descriptor.selected) element.classList.add("is-selected");
  element.setAttribute("aria-label", descriptor.ariaLabel);
  const glyph = document.createElement("span");
  glyph.setAttribute("aria-hidden", "true");
  glyph.textContent = descriptor.glyph;
  element.appendChild(glyph);
  if (onSelectMarker !== undefined) {
    const selectMarker = onSelectMarker;
    element.addEventListener("click", () => {
      selectMarker(descriptor.id);
    });
  }
  return element;
}
