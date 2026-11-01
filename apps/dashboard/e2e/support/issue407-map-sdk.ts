import type { Page } from "@playwright/test";

/** Controlled SDK only: no geographic tiles and no real-provider success proof. */
export async function installIssue407Map(
  page: Page,
  options: {
    readonly tiles?: boolean;
    readonly wait?: Promise<void>;
  } = {},
) {
  await page.route(
    "https://maps.googleapis.com/maps/api/js?**",
    async (route) => {
      await options.wait;
      const callback = new URL(route.request().url()).searchParams.get(
        "callback",
      );
      await route.fulfill({
        contentType: "text/javascript",
        body: `
      window.map407 = { maps: [], circles: [], markers: [], retired: [], cleared: 0 };
      const state = window.map407;
      class MapDouble {
        constructor(node, options) {
          this.options = options; this.fits = []; state.maps.push(this);
          const button = document.createElement('button');
          button.type = 'button'; button.textContent = 'SDK test click (no tiles)';
          button.onclick = () => this.click?.({latLng:{lat:()=>40,lng:()=>-50}});
          node.append(button);
        }
        setCenter(center) { this.center = center; }
        panTo(center) { this.center = center; }
        setZoom(zoom) { this.zoom = zoom; }
        fitBounds(bounds) { this.fits.push(bounds.points); }
        addListener(name, callback) {
          if (name === 'tilesloaded' && ${options.tiles !== false}) setTimeout(() => callback({}), 10);
          if (name === 'click') this.click = callback;
          return {remove:()=>{
            if (name === 'click') {
              state.retired.push(() => callback({latLng:{lat:()=>80,lng:()=>-80}}));
              this.click = null;
            }
          }};
        }
      }
      class CircleDouble {
        constructor(options) {Object.assign(this,options);state.circles.push(this);}
        setMap(map) {this.map=map;}
        setCenter(center) {this.center=center;}
        setRadius(radius) {this.radius=radius;}
      }
      class MarkerDouble {
        constructor(options) {Object.assign(this,options);state.markers.push(this);}
      }
      class BoundsDouble {
        constructor() {this.points=[];}
        extend(point) {this.points.push(point);return this;}
        isEmpty() {return this.points.length===0;}
      }
      window.google={maps:{Map:MapDouble,Circle:CircleDouble,LatLngBounds:BoundsDouble,
        marker:{AdvancedMarkerElement:MarkerDouble},
        event:{clearInstanceListeners:()=>state.cleared++}}};
      ${callback}();
    `,
      });
    },
  );
}

export async function map407State(page: Page) {
  return page.evaluate(() => {
    const s = (
      window as unknown as {
        map407: {
          maps: { options: { colorScheme: string }; fits: unknown[] }[];
          circles: {
            map: unknown;
            center: unknown;
            radius: number;
            strokeColor: string;
          }[];
          markers: { map: unknown; title: string }[];
          cleared: number;
        };
      }
    ).map407;
    return {
      maps: s.maps.map((map) => ({
        scheme: map.options.colorScheme,
        fits: map.fits,
      })),
      circles: s.circles
        .filter((circle) => circle.map)
        .map((circle) => ({
          center: circle.center,
          radius: circle.radius,
          color: circle.strokeColor,
        })),
      titles: s.markers
        .filter((marker) => marker.map)
        .map((marker) => marker.title),
      cleared: s.cleared,
    };
  });
}

export async function replayRetired407Clicks(page: Page) {
  await page.evaluate(() => {
    const state = (window as unknown as { map407: { retired: (() => void)[] } })
      .map407;
    state.retired.forEach((callback) => callback());
  });
}
