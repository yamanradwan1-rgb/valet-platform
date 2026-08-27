/**
 * Shared test double for the MapProvider abstraction used by the
 * SetupMap and LiveOperationsMap lifecycle QA suites (D6-004A).
 *
 * The double records every `createMap` call (init options + container
 * element), exposes the per-instance destroy count, and tracks the
 * global sequence of `createMap` / `destroy` calls so the suite can
 * assert map lifecycle invariants.
 *
 * The double implements the full capability surface (MapInstance,
 * InteractiveMapInstance, MarkerCapableMapInstance) so SetupMap and
 * LiveOperationsMap can both consume it without adapter-specific
 * stubs. It is a *behavior* double, not a browser stub.
 */

import {
  type InteractiveMapInstance,
  type MapClickHandler,
  type MapInitOptions,
  type MapInstance,
  type MapMarkerDefinition,
  type MapMarkerDescriptor,
  type MapPolygonDefinition,
  type MapProviderAdapter,
} from "../../lib/maps/map-provider";
import type { MarkerCapableMapInstance } from "../../lib/maps/map-provider";

export interface RecordedCreate {
  readonly container: HTMLElement;
  readonly options: MapInitOptions;
}

export class MockMap
  implements MapInstance, InteractiveMapInstance, MarkerCapableMapInstance
{
  readonly replacedMarkers: MapMarkerDescriptor[][] = [];
  readonly setMarkersCalls: MapMarkerDefinition[][] = [];
  readonly setPolygonsCalls: MapPolygonDefinition[][] = [];
  private clickHandler: MapClickHandler | null = null;
  focused: string | null = null;
  destroyCount = 0;
  destroyedFlag = false;

  get destroyed(): boolean {
    return this.destroyedFlag;
  }

  destroy(): void {
    if (this.destroyedFlag) return;
    this.destroyedFlag = true;
    this.destroyCount += 1;
    globalState.destroyedCount += 1;
  }

  setMarkers(markers: readonly MapMarkerDefinition[]): void {
    if (this.destroyedFlag) return;
    this.setMarkersCalls.push([...markers]);
  }

  setPolygons(polygons: readonly MapPolygonDefinition[]): void {
    if (this.destroyedFlag) return;
    this.setPolygonsCalls.push([...polygons]);
  }

  setClickHandler(handler: MapClickHandler | null): void {
    if (this.destroyedFlag) return;
    this.clickHandler = handler;
  }

  replaceMarkers(markers: readonly MapMarkerDescriptor[]): void {
    if (this.destroyedFlag) return;
    this.replacedMarkers.push([...markers]);
  }

  focusMarker(id: string): boolean {
    if (this.destroyedFlag) return false;
    this.focused = id;
    return true;
  }

  /** Test-only: emit one click to the registered handler, if any. */
  emitClick(click: Parameters<MapClickHandler>[0]): void {
    if (this.destroyedFlag) return;
    this.clickHandler?.(click);
  }
}

export interface GlobalState {
  createdCount: number;
  destroyedCount: number;
  lastCreate: MockMap | null;
  allCreated: MockMap[];
}

export const globalState: GlobalState = {
  allCreated: [],
  createdCount: 0,
  destroyedCount: 0,
  lastCreate: null,
};

export function resetGlobalState(): void {
  globalState.createdCount = 0;
  globalState.destroyedCount = 0;
  globalState.lastCreate = null;
  globalState.allCreated.length = 0;
}

export class MockMapProviderAdapter implements MapProviderAdapter {
  readonly name = "mock-map-provider";
  readonly requiresApiKey = false;
  readonly recordedCreates: RecordedCreate[] = [];

  async createMap(
    container: HTMLElement,
    options: MapInitOptions,
  ): Promise<MockMap> {
    this.recordedCreates.push({ container, options });
    // Yield so the components can race their mount logic with the
    // promise resolution without coupling the suite to micro-task
    // scheduling.
    await Promise.resolve();
    const instance = new MockMap();
    globalState.createdCount += 1;
    globalState.lastCreate = instance;
    globalState.allCreated.push(instance);
    return instance;
  }
}
