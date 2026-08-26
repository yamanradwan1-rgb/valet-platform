/**
 * Focused test double for the MapLibre browser module behind the
 * OpenFreeMap adapter QA suites.
 *
 * Contains no assertions and no vitest imports: it records what the adapter
 * actually does (markers created/removed, GeoJSON sources replaced, handlers
 * registered, teardown calls) so the adapter contract can be pinned
 * deterministically in the node test environment without a browser harness.
 */

export interface FakeClickEvent {
  readonly stopPropagationCalled: boolean;
  stopPropagation(): void;
}

export class FakeElement {
  readonly tagName: string;
  className = "";
  textContent = "";
  type = "";

  constructor(tagName: string) {
    this.tagName = tagName;
  }

  readonly children: FakeElement[] = [];
  readonly listeners = new Map<string, Array<(event: FakeClickEvent) => void>>();
  private readonly attributes = new Map<string, string>();
  private readonly classes = new Set<string>();

  appendChild(child: FakeElement): FakeElement {
    this.children.push(child);
    return child;
  }

  addEventListener(type: string, handler: (event: FakeClickEvent) => void): void {
    const existing = this.listeners.get(type) ?? [];
    existing.push(handler);
    this.listeners.set(type, existing);
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  get classList(): {
    add(...tokens: string[]): void;
    contains(token: string): boolean;
  } {
    const classes = this.classes;
    return {
      add(...tokens: string[]): void {
        for (const token of tokens) classes.add(token);
      },
      contains(token: string): boolean {
        return classes.has(token);
      },
    };
  }

  /** Dispatches one recorded click listener invocation and returns its event. */
  clickForTest(): FakeClickEvent {
    let stopped = false;
    const event: FakeClickEvent = {
      get stopPropagationCalled() {
        return stopped;
      },
      stopPropagation() {
        stopped = true;
      },
    };
    for (const handler of this.listeners.get("click") ?? []) handler(event);
    return event;
  }
}

export interface FakeGeoJsonSource {
  data: unknown;
  setData(next: unknown): void;
  readonly setDataCalls: unknown[];
}

export interface FakeLayer {
  readonly id: string;
  readonly paint?: unknown;
  readonly source?: string;
  readonly type: string;
}

export interface FakeHit {
  readonly layer: { readonly id: string };
  readonly properties: { readonly id?: string };
}

export interface FakeMapClickPayload {
  readonly lngLat: { lat: number; lng: number };
  readonly originalEvent: unknown;
  readonly point: unknown;
}

export class FakeMap {
  readonly addedLayers: FakeLayer[] = [];
  readonly sources = new Map<string, FakeGeoJsonSource>();
  lastQueriedLayers: readonly string[] | null = null;
  options: {
    center: [number, number];
    container: HTMLElement;
    style: string;
    zoom: number;
  };
  pannedTo: [number, number] | null = null;
  queuedHits: FakeHit[] = [];
  removedCount = 0;

  constructor(options: FakeMap["options"]) {
    if (maplibreDoubleState.failMapConstruction) {
      throw new Error("MAP_INIT_FAILED");
    }
    this.options = options;
    maplibreDoubleState.maps.push(this);
  }

  on(event: string, handler: (payload: unknown) => void): void {
    const existing = this.handlers.get(event) ?? [];
    existing.push(handler);
    this.handlers.set(event, existing);
  }

  emit(event: string, payload?: unknown): void {
    for (const handler of this.handlers.get(event) ?? []) handler(payload);
  }

  addSource(id: string, data: unknown): void {
    const source: FakeGeoJsonSource = {
      data,
      setDataCalls: [],
      setData(next: unknown): void {
        this.data = next;
        this.setDataCalls.push(next);
      },
    };
    this.sources.set(id, source);
  }

  getSource(id: string): FakeGeoJsonSource | undefined {
    return this.sources.get(id);
  }

  addLayer(layer: FakeLayer): void {
    this.addedLayers.push(layer);
  }

  queryRenderedFeatures(
    _point: unknown,
    options: { layers?: string[] },
  ): FakeHit[] {
    this.lastQueriedLayers = options.layers ?? null;
    return this.queuedHits;
  }

  panTo(center: [number, number]): void {
    this.pannedTo = center;
  }

  remove(): void {
    this.removedCount += 1;
  }

  private handlers = new Map<string, Array<(payload: unknown) => void>>();
}

export class FakeMarker {
  attachedTo: unknown = null;
  element: unknown;
  lngLat: [number, number] | null = null;
  removedCount = 0;

  constructor(options: { element: unknown }) {
    this.element = options.element;
    maplibreDoubleState.markers.push(this);
  }

  setLngLat(lngLat: [number, number]): this {
    this.lngLat = lngLat;
    return this;
  }

  addTo(map: unknown): this {
    this.attachedTo = map;
    return this;
  }

  remove(): void {
    this.removedCount += 1;
  }
}

/** Mutable state shared between the double and the QA suites. */
export const maplibreDoubleState = {
  failMapConstruction: false,
  maps: [] as FakeMap[],
  markers: [] as FakeMarker[],
};

export function resetMaplibreDouble(): void {
  maplibreDoubleState.failMapConstruction = false;
  maplibreDoubleState.maps = [];
  maplibreDoubleState.markers = [];
}

/**
 * The live-marker plumbing touches `document` when elements are created.
 * Installs a minimal stand-in so the node test environment can exercise it.
 */
export function installFakeDocument(): void {
  globalThis.document = {
    createElement: (tagName: string) => new FakeElement(tagName),
  } as unknown as Document;
}
