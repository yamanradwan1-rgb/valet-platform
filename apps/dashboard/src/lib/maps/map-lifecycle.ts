/**
 * Map instance lifecycle (D6-004A).
 *
 * Pure, testable controller for the dashboard's map instance lifecycle.
 * The SetupMap and LiveOperationsMap components wrap this controller
 * with React state and effects; the wrapped logic is intentionally
 * small so the lifecycle is fully testable in plain TypeScript without
 * a DOM, without React rendering, and without maplibre-gl.
 *
 * The controller exposes a single decision:
 *
 *   given a previous owner key and a new owner key + init options,
 *   do I (a) reuse the existing instance and push the new data, or
 *   (b) destroy the existing instance and create a new one, or
 *   (c) do nothing (already disposed)?
 *
 * Reuse happens when the key is identical AND the previous instance is
 * still alive. Anything else (including a different key with the same
 * numeric value) is a recreation. The data push is a cheap forward to
 * the active instance and never recreates the map.
 *
 * The actual `createMap` / `destroy` calls go through the injected
 * `MapProviderAdapter` so tests can swap in a recording double and
 * assert on the call sequence.
 */

import type {
  InteractiveMapInstance,
  MapInitOptions,
  MapInstance,
  MapMarkerDefinition,
  MapPolygonDefinition,
  MapProviderAdapter,
} from "./map-provider";

export interface MapDataInput {
  readonly markers?: readonly MapMarkerDefinition[];
  readonly polygons?: readonly MapPolygonDefinition[];
  readonly clickHandler?: ((click: unknown) => void) | null;
}

export type MapLifecycleAction =
  | { readonly kind: "create"; readonly instance: MapInstance }
  | { readonly kind: "reuse"; readonly instance: MapInstance }
  | { readonly kind: "noop-disposed" };

interface MapControllerState {
  currentKey: string | null;
  currentInstance: MapInstance | null;
  disposed: boolean;
}

export interface MapController {
  /** Current owner key, or `null` when fresh / disposed / pre-create. */
  readonly currentKey: string | null;
  /** Current live instance, or `null` after dispose / pre-create. */
  readonly currentInstance: MapInstance | null;
  readonly disposed: boolean;
  /**
   * Drives the create-vs-reuse decision for a (key, options) pair. The
   * caller awaits the result and may use the returned instance. The
   * controller owns the instance after the call; the caller must not
   * call `destroy()` on it.
   */
  ensure(
    key: string,
    options: MapInitOptions,
  ): Promise<MapLifecycleAction>;
  /** Cheap forward of markers / polygons / click handler. */
  pushData(input: MapDataInput): void;
  /**
   * Destroys the owned instance (if any) and locks the controller. All
   * subsequent `ensure()` calls return `noop-disposed`. The component
   * calls this from its effect cleanup; tests call it directly.
   */
  dispose(): void;
}

export interface MapControllerDeps {
  readonly adapter: MapProviderAdapter;
  /**
   * Resolves the current DOM container for adapter calls. The container
   * is owned by the component, not the controller; the component passes
   * a closure so the controller can defer reading the ref until `ensure`
   * is called.
   */
  readonly getContainer: () => HTMLElement | null;
}

function isInteractive(
  instance: MapInstance,
): instance is InteractiveMapInstance {
  return (
    typeof (instance as Partial<InteractiveMapInstance>).setMarkers ===
    "function"
  );
}

function safeDestroy(instance: MapInstance | null): void {
  if (instance === null) return;
  if ((instance as { destroyed?: boolean }).destroyed === true) return;
  instance.destroy();
}

/**
 * Synchronous preview of what `ensure()` would do WITHOUT mutating
 * state. Exposed so tests can probe the decision without paying the
 * cost of an async create, and so the component can decide whether
 * the effect should short-circuit.
 */
export function previewEnsure(
  controller: Pick<MapController, "currentKey" | "currentInstance" | "disposed">,
  key: string,
): "create" | "reuse" | "noop-disposed" {
  if (controller.disposed) return "noop-disposed";
  if (controller.currentKey === key && controller.currentInstance !== null) {
    return "reuse";
  }
  return "create";
}

/**
 * Builds a fresh map controller bound to the given adapter. The caller
 * owns the controller and must call `dispose()` exactly once when the
 * host component unmounts.
 */
export function createMapController(deps: MapControllerDeps): MapController {
  const { adapter, getContainer } = deps;
  const state: MapControllerState = {
    currentInstance: null,
    currentKey: null,
    disposed: false,
  };

  return {
    get currentKey() {
      return state.currentKey;
    },
    get currentInstance() {
      return state.currentInstance;
    },
    get disposed() {
      return state.disposed;
    },
    async ensure(key, options) {
      if (state.disposed) return { kind: "noop-disposed" };
      if (state.currentKey === key && state.currentInstance !== null) {
        return { kind: "reuse", instance: state.currentInstance };
      }
      const container = getContainer();
      if (container === null) {
        // Without a container we cannot drive the adapter. Treat as a
        // disposed no-op so the component can re-try on the next render
        // when its ref is populated.
        return { kind: "noop-disposed" };
      }
      const next = await adapter.createMap(container, options);
      if (state.disposed) {
        // The controller was disposed while the adapter was resolving.
        // Destroy the late instance and do not adopt it.
        safeDestroy(next);
        return { kind: "noop-disposed" };
      }
      safeDestroy(state.currentInstance);
      state.currentInstance = next;
      state.currentKey = key;
      return { kind: "create", instance: next };
    },
    pushData({ markers, polygons, clickHandler }) {
      if (state.disposed) return;
      const instance = state.currentInstance;
      if (instance === null) return;
      if (!isInteractive(instance)) return;
      if (markers !== undefined) instance.setMarkers([...markers]);
      if (polygons !== undefined) instance.setPolygons([...polygons]);
      if (clickHandler !== undefined) {
        instance.setClickHandler(clickHandler as never);
      }
    },
    dispose() {
      if (state.disposed) return;
      state.disposed = true;
      safeDestroy(state.currentInstance);
      state.currentInstance = null;
      state.currentKey = null;
    },
  };
}
