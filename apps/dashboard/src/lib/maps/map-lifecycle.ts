/**
 * Map instance lifecycle (D6-004A + D6-004B).
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
 * D6-004B: stale `ensure` race — an obsolete asynchronous `ensure`
 * result can never replace a newer requested lifecycle owner. Every
 * `ensure` call increments a synchronous `requestToken` and captures
 * its own value. After the adapter resolves, the call only adopts the
 * instance when its own token still matches the controller's latest
 * token. Otherwise the late instance is destroyed in isolation and
 * the existing owner (or the newer request) is preserved untouched.
 *
 * The actual `createMap` / `destroy` calls go through the injected
 * `MapProviderAdapter` so tests can swap in a recording double and
 * assert on the call sequence.
 */

import type {
  InteractiveMapInstance,
  MapClickHandler,
  MapInitOptions,
  MapInstance,
  MapMarkerDefinition,
  MapMarkerDescriptor,
  MapPolygonDefinition,
  MapProviderAdapter,
} from "./map-provider";

export interface MapDataInput {
  readonly markers?: readonly MapMarkerDefinition[];
  /**
   * Live Operations marker drafts (the `ariaLabel` is filled in by
   * the Live Operations component on push). Accepted as
   * `Omit<MapMarkerDescriptor, "ariaLabel">` to match the
   * feature-level draft type.
   */
  readonly liveMarkers?: ReadonlyArray<
    Omit<MapMarkerDescriptor, "ariaLabel">
  >;
  readonly polygons?: readonly MapPolygonDefinition[];
  readonly clickHandler?: MapClickHandler | null;
}

export type MapLifecycleAction =
  | { readonly kind: "create"; readonly instance: MapInstance }
  | { readonly kind: "reuse"; readonly instance: MapInstance }
  | { readonly kind: "noop-disposed" }
  | { readonly kind: "noop-stale" };

interface MapControllerState {
  currentKey: string | null;
  currentInstance: MapInstance | null;
  /** Monotonically increasing token of the latest requested `ensure` call. */
  requestToken: number;
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
   *
   * Multiple in-flight `ensure` calls are safe: only the latest one
   * adopts its instance. Older calls that resolve after a newer one
   * destroy their own returned instance in isolation and report
   * `noop-stale`.
   */
  ensure(
    key: string,
    options: MapInitOptions,
  ): Promise<MapLifecycleAction>;
  /**
   * Cheap forward of markers / polygons / click handler. The
   * components use this after every successful `ensure` resolution so
   * the freshly adopted instance is always initialized with the
   * CURRENT data and click handler — no stacked handlers, no missed
   * initial push.
   */
  pushData(input: MapDataInput): void;
  /**
   * Destroys the owned instance (if any) and locks the controller. All
   * subsequent `ensure()` calls return `noop-disposed`. The component
   * calls this from its effect cleanup; tests call it directly.
   * Stale `ensure` resolutions that arrive after dispose destroy their
   * own returned instance in isolation and report `noop-stale`.
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
    requestToken: 0,
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
      // Synchronous reuse: the current instance is already on the right
      // key. This is the cheap path and is independent of the
      // requestToken race below.
      if (state.currentKey === key && state.currentInstance !== null) {
        return { kind: "reuse", instance: state.currentInstance };
      }
      // Record this call as the latest requested owner BEFORE awaiting.
      // Any later ensure() will bump the token; if the current call
      // resolves after that, myToken !== state.requestToken and the
      // late instance is destroyed in isolation. The token is
      // monotonically increasing and is bumped on every invocation,
      // including synchronous failures (e.g. no container) so a
      // subsequent caller can always claim ownership.
      const myToken = state.requestToken + 1;
      state.requestToken = myToken;
      const container = getContainer();
      if (container === null) {
        return { kind: "noop-stale" };
      }
      const next = await adapter.createMap(container, options);
      // Stale-completion check: a newer ensure() has been issued while
      // the adapter was resolving. The newer request has bumped the
      // token; our myToken is no longer the latest. Destroy ONLY the
      // late instance; never touch the current owner.
      if (state.disposed) {
        safeDestroy(next);
        return { kind: "noop-disposed" };
      }
      if (state.requestToken !== myToken) {
        safeDestroy(next);
        return { kind: "noop-stale" };
      }
      safeDestroy(state.currentInstance);
      state.currentInstance = next;
      state.currentKey = key;
      return { kind: "create", instance: next };
    },
    pushData({ markers, liveMarkers, polygons, clickHandler }) {
      if (state.disposed) return;
      const instance = state.currentInstance;
      if (instance === null) return;
      if (!isInteractive(instance)) return;
      if (markers !== undefined) instance.setMarkers([...markers]);
      if (polygons !== undefined) instance.setPolygons([...polygons]);
      if (clickHandler !== undefined) {
        instance.setClickHandler(clickHandler);
      }
      // Live Operations uses a different marker descriptor shape.
      // When the liveMarkers payload is present, route it to the
      // marker-capable `replaceMarkers` API.
      if (liveMarkers !== undefined) {
        const markerCapable = instance as Partial<{
          replaceMarkers: (
            markers: ReadonlyArray<Omit<MapMarkerDescriptor, "ariaLabel">>,
          ) => void;
        }>;
        if (typeof markerCapable.replaceMarkers === "function") {
          markerCapable.replaceMarkers(liveMarkers);
        }
      }
    },
    dispose() {
      if (state.disposed) return;
      state.disposed = true;
      // Bump the token so any in-flight stale call reports noop-stale
      // and destroys its own returned instance.
      state.requestToken = state.requestToken + 1;
      safeDestroy(state.currentInstance);
      state.currentInstance = null;
      state.currentKey = null;
    },
  };
}
