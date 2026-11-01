import { vi, type Mock } from "vitest";
import type {
  GeoCenter,
  GoogleMapsSdk,
} from "../../../../lib/maps/google-maps-sdk";
import type { StudioZone } from "./studio-types";

export const zone: StudioZone = {
  id: "zone-a",
  code: "GATE",
  label: "Test gate",
  latitude: 12,
  longitude: 24,
  radius: 77.25,
  revision: 3,
  status: "ACTIVE",
};

/** Controlled geographic SDK double. No provider/tile delivery is simulated. */
export function testSdk() {
  const maps: MapDouble[] = [];
  const circles: CircleDouble[] = [];
  const markers: MarkerDouble[] = [];
  const cleared: Mock = vi.fn();
  class BoundsDouble {
    points: GeoCenter[] = [];
    extend(point: GeoCenter) {
      this.points.push(point);
      return this;
    }
    isEmpty() {
      return this.points.length === 0;
    }
  }
  class MapDouble {
    fits: BoundsDouble[] = [];
    listeners: {
      name: string;
      callback: (event: object) => void;
      remove: ReturnType<typeof vi.fn>;
    }[] = [];
    panTo: Mock = vi.fn();
    setCenter: Mock = vi.fn();
    setZoom: Mock = vi.fn();
    constructor(
      _node: HTMLElement,
      readonly options: Record<string, unknown>,
    ) {
      maps.push(this);
    }
    fitBounds(bounds: BoundsDouble) {
      this.fits.push(bounds);
    }
    addListener(name: string, callback: (event: object) => void) {
      const remove: Mock = vi.fn();
      this.listeners.push({ name, callback, remove });
      return { remove };
    }
  }
  class CircleDouble {
    map: unknown;
    center: unknown;
    radius: unknown;
    setMap: Mock<(map: unknown) => void> = vi.fn((map: unknown) => {
      this.map = map;
    });
    setCenter: Mock<(center: unknown) => void> = vi.fn((center: unknown) => {
      this.center = center;
    });
    setRadius: Mock<(radius: unknown) => void> = vi.fn((radius: unknown) => {
      this.radius = radius;
    });
    constructor(readonly options: Record<string, unknown>) {
      this.map = options.map;
      this.center = options.center;
      this.radius = options.radius;
      circles.push(this);
    }
  }
  class MarkerDouble {
    map: unknown;
    position: unknown;
    constructor(readonly options: Record<string, unknown>) {
      this.map = options.map;
      this.position = options.position;
      markers.push(this);
    }
  }
  const sdk = {
    Map: MapDouble,
    Circle: CircleDouble,
    LatLngBounds: BoundsDouble,
    marker: { AdvancedMarkerElement: MarkerDouble },
    event: { clearInstanceListeners: cleared },
  } as unknown as GoogleMapsSdk;
  const node = { replaceChildren: vi.fn() } as unknown as HTMLElement;
  vi.stubGlobal("document", {
    createElement: () => ({ className: "", style: {}, setAttribute: vi.fn() }),
  });
  return { sdk, node, maps, circles, markers, cleared };
}
