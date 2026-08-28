/**
 * Shared test double for the MapProvider abstraction used by the
 * SetupMap and LiveOperationsMap lifecycle QA suites (D6-004A / B).
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
 *
 * D6-004B: the adapter supports explicit per-call latency control so
 * the out-of-order async test can deterministically stage when each
 * `createMap` resolves. Tests that do not opt in fall back to a
 * one-microtask yield.
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
  type MarkerCapableMapInstance,
} from "../../lib/maps/map-provider";

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
  readonly setClickHandlerCalls: (MapClickHandler | null)[] = [];
  private clickHandler: MapClickHandler | null = null;
  focused: string | null = null;
  destroyCount = 0;
  destroyedFlag = false;
  /** Monotonic identifier assigned at construction. */
  readonly id: number;

  constructor(id: number) {
    this.id = id;
  }

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
    this.setClickHandlerCalls.push(handler);
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
  /** Next monotonic id to assign to a freshly created MockMap. */
  nextId: number;
}

export const globalState: GlobalState = {
  allCreated: [],
  createdCount: 0,
  destroyedCount: 0,
  lastCreate: null,
  nextId: 1,
};

export function resetGlobalState(): void {
  globalState.createdCount = 0;
  globalState.destroyedCount = 0;
  globalState.lastCreate = null;
  globalState.allCreated.length = 0;
  globalState.nextId = 1;
}

/**
 * Per-call latency override. When set, `createMap` will await this
 * many ms before resolving; when null, the adapter yields one
 * microtask and resolves.
 */
export class MockMapProviderAdapter implements MapProviderAdapter {
  readonly name = "mock-map-provider";
  readonly requiresApiKey = false;
  readonly recordedCreates: RecordedCreate[] = [];
  /**
   * Optional per-call delay (in ms). Set to a non-null number to make
   * that specific `createMap` call wait before resolving; set back to
   * null (default) to restore the microtask yield. Tests can switch
   * this between calls to deterministically stage out-of-order
   * resolution.
   */
  nextCreateDelayMs: number | null = null;
  /** Hook invoked synchronously when a `createMap` call is received. */
  onCreateHook: ((entry: RecordedCreate) => void) | null = null;

  async createMap(
    container: HTMLElement,
    options: MapInitOptions,
  ): Promise<MockMap> {
    const entry: RecordedCreate = { container, options };
    this.recordedCreates.push(entry);
    this.onCreateHook?.(entry);
    if (this.nextCreateDelayMs !== null) {
      await new Promise<void>((resolve) =>
        setTimeout(resolve, this.nextCreateDelayMs ?? 0),
      );
    } else {
      await Promise.resolve();
    }
    const instance = new MockMap(globalState.nextId);
    globalState.nextId += 1;
    globalState.createdCount += 1;
    globalState.lastCreate = instance;
    globalState.allCreated.push(instance);
    return instance;
  }
}
