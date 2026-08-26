import type { LocationMapArea, LocationMapPoint } from "@valet/contracts";

import type { MapCenter } from "../../lib/maps/map-provider";

/**
 * Location-scoped TRANSIENT interaction state of the /maps-zones surface.
 *
 * Every field here describes an interaction with ONE specific location's
 * entities (an open editor holding an authoritative A snapshot, a pending
 * deactivation confirmation, a coordinate picked from A's map, selections,
 * or mutation/error text raised under A). None of it may survive a location
 * switch: tenant-isolation is a UI-truth requirement, not only a backend
 * authorization concern.
 *
 * Deliberately NOT part of this bundle: the Points/Areas tab preference —
 * it carries no entity or location data, so keeping it across a switch does
 * not surface any Location-A fact under B.
 */

export type EditorState =
  | { readonly type: "point.create" }
  | { readonly type: "point.edit"; readonly point: LocationMapPoint }
  | { readonly type: "area.create" }
  | { readonly type: "area.fields"; readonly area: LocationMapArea }
  | { readonly type: "area.vertices"; readonly area: LocationMapArea };

export type DeactivateTarget =
  | { readonly kind: "point"; readonly id: string }
  | { readonly kind: "area"; readonly id: string }
  | null;

export interface MapSetupTransientState {
  /** Selected point row in the CURRENT location's list/map. */
  readonly selectedPointId: string | null;
  /** Selected area row in the CURRENT location's list/map. */
  readonly selectedAreaId: string | null;
  /** Open create/edit/vertices sheet (holds its A-entity snapshot when editing). */
  readonly editor: EditorState | null;
  /** Pending deactivation confirmation targeting a CURRENT-location entity. */
  readonly deactivateTarget: DeactivateTarget;
  /** Latest map-surface click offered to an open sheet. */
  readonly pickedCoordinate: MapCenter | null;
  /** Sheet-local failure text raised by a mutation of THIS location. */
  readonly sheetError: string | null;
  /** Board-banner failure text raised by an action of THIS location. */
  readonly actionError: string | null;
}

/** The neutral Map Setup interaction state every location starts from. */
export function initialTransientState(): MapSetupTransientState {
  return {
    actionError: null,
    deactivateTarget: null,
    editor: null,
    pickedCoordinate: null,
    selectedAreaId: null,
    selectedPointId: null,
    sheetError: null,
  };
}

/**
 * The single location-identity boundary for transient UI.
 *
 * Returns the caller's current state untouched (same reference) while the
 * interaction still belongs to the requested location, and a fresh neutral
 * state the moment the requested location differs — so an A→B switch can
 * never keep showing A's editor, draft, confirmation, selection, picked
 * coordinate or A-raised error text under B. Request identity/race guards
 * for loads and mutations are separate and remain in map-setup-state.ts /
 * use-map-setup.ts.
 */
export function resetTransientOnLocationChange(
  stateOpenedForLocationId: string,
  requestedLocationId: string,
  current: MapSetupTransientState,
): MapSetupTransientState {
  if (stateOpenedForLocationId === requestedLocationId) return current;
  return initialTransientState();
}
