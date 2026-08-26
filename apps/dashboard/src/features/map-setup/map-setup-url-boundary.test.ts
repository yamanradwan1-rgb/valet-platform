import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createMapArea,
  createMapPoint,
  fetchMapAreas,
  fetchMapPoints,
  replaceMapAreaVertices,
  updateMapArea,
  updateMapPoint,
} from "./map-setup-api";
import {
  getStaffApiBaseUrl,
  STAFF_API_BROWSER_BASE_PATH,
} from "../../lib/api/api-config";
import { StaffApiClient } from "../../lib/api/staff-api-client";

/**
 * EXACT resolved-URL proof for Map Setup transport (D3-003).
 *
 * These tests run the REAL production StaffApiClient URL construction
 * (`fetch(\`${baseUrl}${path}\`)` inside requestOnce) against a stubbed
 * global fetch — they do NOT mock `client.request()` — so the captured URL
 * is byte-for-byte what the browser/server would request:
 *
 *   browser base  "/v1/staff"  (same-origin Next.js rewrite)
 *   server base   "${API_ORIGIN}/v1/staff"
 *
 * plus the Map Setup relative paths. The doubled historical defect
 * ("/v1/staff/v1/staff/...") is asserted impossible below.
 */

const LOCATION_ID = "5f0f3f4e-9d6a-4a1c-8f2e-1b2c3d4e5f60";
const POINT_ID = "11111111-2222-4333-8444-555555555555";
const AREA_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

/** Characters that MUST stay percent-encoded inside path segments. */
const ODD_LOCATION_ID = "loc ation/?#1";

function pointEntity(id = POINT_ID): unknown {
  return {
    active: true,
    code: "ENT_MAIN",
    createdAt: "2026-08-20T09:00:00+03:00",
    id,
    kind: "ENTRANCE",
    label: "Main Entrance",
    latitude: 32.562703,
    levelLabel: null,
    longitude: 35.880055,
    updatedAt: "2026-08-20T09:00:00+03:00",
  };
}

function areaEntity(id = AREA_ID): unknown {
  return {
    active: true,
    code: "PARK_A",
    createdAt: "2026-08-20T09:10:00+03:00",
    id,
    label: "Parking Area A",
    levelLabel: null,
    parkingZoneId: null,
    purpose: "PARKING",
    updatedAt: "2026-08-20T09:10:00+03:00",
    vertices: [
      { latitude: 32.5625, longitude: 35.88, position: 0 },
      { latitude: 32.5628, longitude: 35.8805, position: 1 },
      { latitude: 32.5623, longitude: 35.8807, position: 2 },
    ],
  };
}

interface CapturedRequest {
  readonly init: RequestInit | undefined;
  readonly url: string;
}

let captured: CapturedRequest | null = null;

function stubFetch(entity: () => unknown): void {
  stubFetchSequence([entity]);
}

function stubFetchSequence(payloads: Array<() => unknown>): void {
  let call = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit): Promise<Response> => {
      captured = { init, url };
      const produce =
        payloads[Math.min(call, payloads.length - 1)] ?? (() => null);
      call += 1;
      return new Response(JSON.stringify(produce()), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      });
    }),
  );
}

function browserClient(): StaffApiClient {
  // Production BROWSER base exactly as api-config exports it.
  return new StaffApiClient({
    baseUrl: STAFF_API_BROWSER_BASE_PATH,
    getAccessToken: () => null,
    recoverFromUnauthorized: async () => null,
  });
}

async function driveAllOperations(client: StaffApiClient): Promise<void> {
  const signal = new AbortController().signal;
  await fetchMapPoints(client, LOCATION_ID, signal);
  await createMapPoint(client, LOCATION_ID, {
    active: true,
    code: "ENT_MAIN",
    kind: "ENTRANCE",
    label: "Main Entrance",
    latitude: 32.562703,
    levelLabel: null,
    longitude: 35.880055,
  });
  await updateMapPoint(client, LOCATION_ID, POINT_ID, { active: false });
  await fetchMapAreas(client, LOCATION_ID, signal);
  await createMapArea(client, LOCATION_ID, {
    active: true,
    code: "PARK_A",
    label: "Parking Area A",
    levelLabel: null,
    parkingZoneId: null,
    purpose: "PARKING",
    vertices: [
      { latitude: 32.5625, longitude: 35.88 },
      { latitude: 32.5628, longitude: 35.8805 },
      { latitude: 32.5623, longitude: 35.8807 },
    ],
  });
  await updateMapArea(client, LOCATION_ID, AREA_ID, { label: "Renamed" });
  await replaceMapAreaVertices(client, LOCATION_ID, AREA_ID, {
    vertices: [
      { latitude: 32.5631, longitude: 35.8812 },
      { latitude: 32.5633, longitude: 35.8815 },
      { latitude: 32.563, longitude: 35.8817 },
    ],
  });
}

beforeEach(() => {
  captured = null;
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.API_ORIGIN;
});

describe("resolved Map Setup URLs through the real StaffApiClient", () => {
  it("resolves every operation to exactly one '/v1/staff' prefix (browser base)", async () => {
    const responses: Array<() => unknown> = [
      () => ({ points: [pointEntity()] }), // GET  points (list wrapper)
      () => pointEntity(), // POST points
      () => pointEntity(), // PATCH point
      () => ({ areas: [areaEntity()] }), // GET  areas (list wrapper)
      () => areaEntity(), // POST areas
      () => areaEntity(), // PATCH area
      () => areaEntity(), // PUT  vertices
    ];
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit): Promise<Response> => {
        captured = { init, url };
        const entity =
          responses[Math.min(call, responses.length - 1)] ?? (() => null);
        call += 1;
        return new Response(JSON.stringify(entity()), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        });
      }),
    );

    await driveAllOperations(browserClient());

    const urls: string[] = [];
    // Re-drive capture list via mock calls recorded above.
    const mocked = vi.mocked(fetch);
    for (const callItem of mocked.mock.calls) {
      urls.push(String(callItem[0]));
    }
    expect(urls).toEqual([
      `/v1/staff/locations/${LOCATION_ID}/map/points`,
      `/v1/staff/locations/${LOCATION_ID}/map/points`,
      `/v1/staff/locations/${LOCATION_ID}/map/points/${POINT_ID}`,
      `/v1/staff/locations/${LOCATION_ID}/map/areas`,
      `/v1/staff/locations/${LOCATION_ID}/map/areas`,
      `/v1/staff/locations/${LOCATION_ID}/map/areas/${AREA_ID}`,
      `/v1/staff/locations/${LOCATION_ID}/map/areas/${AREA_ID}/vertices`,
    ]);
    for (const url of urls) {
      expect(url.startsWith("/v1/staff/")).toBe(true);
      expect(url.includes("/v1/staff/v1/staff")).toBe(false);
    }
    expect(captured?.init?.method).toBe("PUT");
  });

  it("keeps percent-encoding of location and entity ids end-to-end", async () => {
    // List endpoint wraps entities; PATCH returns the bare entity.
    stubFetchSequence([() => ({ points: [pointEntity()] }), () => pointEntity()]);
    const client = browserClient();
    await fetchMapPoints(client, ODD_LOCATION_ID);
    expect(captured?.url).toBe(
      "/v1/staff/locations/loc%20ation%2F%3F%231/map/points",
    );
    await updateMapPoint(browserClient(), ODD_LOCATION_ID, "pt/x?id", {
      active: true,
    });
    expect(captured?.url).toBe(
      "/v1/staff/locations/loc%20ation%2F%3F%231/map/points/pt%2Fx%3Fid",
    );
  });

  it("uses the same single prefix under server-side base resolution", async () => {
    process.env.API_ORIGIN = "https://api.example.test";
    stubFetch(() => ({ points: [] }));
    // No explicit baseUrl: production default resolution runs here.
    const client = new StaffApiClient({
      getAccessToken: () => null,
      recoverFromUnauthorized: async () => null,
    });
    expect(getStaffApiBaseUrl()).toBe("https://api.example.test/v1/staff");
    await fetchMapPoints(client, LOCATION_ID);
    expect(captured?.url).toBe(
      `https://api.example.test/v1/staff/locations/${LOCATION_ID}/map/points`,
    );
  });
});
