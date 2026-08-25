import { describe, expect, it } from "vitest";

import {
  createMapArea,
  createMapPoint,
  fetchMapAreas,
  fetchMapPoints,
  loadMapSetup,
  replaceMapAreaVertices,
  updateMapArea,
  updateMapPoint,
  type MapSetupClient,
} from "./map-setup-api";
import type {
  CreateLocationMapAreaRequest,
  CreateLocationMapPointRequest,
} from "@valet/contracts";

const LOCATION_ID = "5f0f3f4e-9d6a-4a1c-8f2e-1b2c3d4e5f60";
const POINT_ID = "11111111-2222-4333-8444-555555555555";
const AREA_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

const BASE = `/v1/staff/locations/${LOCATION_ID}/map`;

interface RecordedRequestOptions {
  readonly body?: unknown;
  readonly method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE" | undefined;
  readonly signal?: AbortSignal | undefined;
  readonly skipAuthorization?: boolean | undefined;
}

interface RecordedRequest {
  readonly path: string;
  readonly options: RecordedRequestOptions;
}

function recordingClient(
  responder: (path: string, options: RecordedRequest["options"]) => unknown,
): { client: MapSetupClient; requests: RecordedRequest[] } {
  const requests: RecordedRequest[] = [];
  const client: MapSetupClient = {
    async request<T>(
      path: string,
      options: RecordedRequestOptions = {},
    ): Promise<T> {
      requests.push({ options, path });
      return responder(path, options) as T;
    },
  };
  return { client, requests };
}

function singlePointPayload(): unknown {
  return {
    active: true,
    code: "ENT_MAIN",
    createdAt: "2026-08-20T09:00:00+03:00",
    id: POINT_ID,
    kind: "ENTRANCE",
    label: "Main Entrance",
    latitude: 32.562703,
    levelLabel: null,
    longitude: 35.880055,
    updatedAt: "2026-08-20T09:00:00+03:00",
  };
}

function pointPayload(): unknown {
  return { points: [singlePointPayload()] };
}

function singleAreaPayload(): unknown {
  return {
    active: true,
    code: "PARK_A",
    createdAt: "2026-08-20T09:10:00+03:00",
    id: AREA_ID,
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

function areaPayload(): unknown {
  return { areas: [singleAreaPayload()] };
}

describe("map setup endpoint wiring", () => {
  it("requests the verified points list endpoint with GET", async () => {
    const { client, requests } = recordingClient(() => pointPayload());
    await fetchMapPoints(client, LOCATION_ID);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.path).toBe(`${BASE}/points`);
    expect(requests[0]?.options.method).toBeUndefined();
  });

  it("requests the verified areas list endpoint with GET", async () => {
    const { client, requests } = recordingClient(() => areaPayload());
    await fetchMapAreas(client, LOCATION_ID);
    expect(requests[0]?.path).toBe(`${BASE}/areas`);
    expect(requests[0]?.options.method).toBeUndefined();
  });

  it("creates a point through POST /points with the exact typed payload", async () => {
    const { client, requests } = recordingClient(() => singlePointPayload());
    const request: CreateLocationMapPointRequest = {
      active: true,
      code: "ENT_MAIN",
      kind: "ENTRANCE",
      label: "Main Entrance",
      latitude: 32.562703,
      levelLabel: null,
      longitude: 35.880055,
    };
    const created = await createMapPoint(client, LOCATION_ID, request);
    expect(requests[0]?.path).toBe(`${BASE}/points`);
    expect(requests[0]?.options.method).toBe("POST");
    expect(requests[0]?.options.body).toEqual(request);
    expect(created.latitude).toBe(32.562703);
    expect(created.longitude).toBe(35.880055);
  });

  it("patches a point at the exact point-scoped path", async () => {
    const { client, requests } = recordingClient(() => singlePointPayload());
    await updateMapPoint(client, LOCATION_ID, POINT_ID, { active: false });
    expect(requests[0]?.path).toBe(`${BASE}/points/${POINT_ID}`);
    expect(requests[0]?.options.method).toBe("PATCH");
    expect(requests[0]?.options.body).toEqual({ active: false });
  });

  it("deactivates a point truthfully via PATCH active=false, never DELETE", async () => {
    const { client, requests } = recordingClient(() => singlePointPayload());
    await updateMapPoint(client, LOCATION_ID, POINT_ID, { active: false });
    expect(requests[0]?.options.method).toBe("PATCH");
    expect(requests[0]?.options.body).toEqual({ active: false });
  });

  it("deactivates an area truthfully via PATCH active=false, never DELETE", async () => {
    const { client, requests } = recordingClient(() => singleAreaPayload());
    await updateMapArea(client, LOCATION_ID, AREA_ID, { active: false });
    expect(requests[0]?.options.method).toBe("PATCH");
    expect(requests[0]?.options.body).toEqual({ active: false });
  });

  it("creates an area through POST /areas including its ordered vertices", async () => {
    const { client, requests } = recordingClient(() => singleAreaPayload());
    const vertices = [
      { latitude: 32.5625, longitude: 35.88 },
      { latitude: 32.5628, longitude: 35.8805 },
      { latitude: 32.5623, longitude: 35.8807 },
    ];
    const request: CreateLocationMapAreaRequest = {
      active: true,
      code: "PARK_A",
      label: "Parking Area A",
      levelLabel: null,
      parkingZoneId: null,
      purpose: "PARKING",
      vertices,
    };
    await createMapArea(client, LOCATION_ID, request);
    expect(requests[0]?.path).toBe(`${BASE}/areas`);
    expect(requests[0]?.options.method).toBe("POST");
    expect(requests[0]?.options.body).toEqual({ ...request, vertices });
  });

  it("patches area fields WITHOUT ever sending vertices", async () => {
    const { client, requests } = recordingClient(() => singleAreaPayload());
    await updateMapArea(client, LOCATION_ID, AREA_ID, { label: "Renamed" });
    expect(requests[0]?.path).toBe(`${BASE}/areas/${AREA_ID}`);
    expect(requests[0]?.options.method).toBe("PATCH");
    expect(requests[0]?.options.body).toEqual({ label: "Renamed" });
    expect(JSON.stringify(requests[0]?.options.body)).not.toContain("vertices");
  });

  it("replaces vertices through PUT on the dedicated vertices operation", async () => {
    const { client, requests } = recordingClient(() => singleAreaPayload());
    const vertices = [
      { latitude: 32.5631, longitude: 35.8812 },
      { latitude: 32.5633, longitude: 35.8815 },
      { latitude: 32.563, longitude: 35.8817 },
      { latitude: 32.5629, longitude: 35.8814 },
    ];
    await replaceMapAreaVertices(client, LOCATION_ID, AREA_ID, { vertices });
    expect(requests[0]?.path).toBe(`${BASE}/areas/${AREA_ID}/vertices`);
    expect(requests[0]?.options.method).toBe("PUT");
    // Order is authoritative verbatim: no sorting, no added closing vertex.
    expect(requests[0]?.options.body).toEqual({ vertices });
    const body = requests[0]?.options.body as { vertices: unknown[] };
    expect(body.vertices).toHaveLength(4);
  });

  it("composes one concurrent load of both collections", async () => {
    const { client, requests } = recordingClient((path) =>
      path.endsWith("/points") ? pointPayload() : areaPayload(),
    );
    const data = await loadMapSetup(client, LOCATION_ID);
    expect(data.points).toHaveLength(1);
    expect(data.areas).toHaveLength(1);
    expect(requests.map((request) => request.path).sort()).toEqual(
      [`${BASE}/areas`, `${BASE}/points`].sort(),
    );
  });

  it("forwards abort signals on reads", async () => {
    const controller = new AbortController();
    const { client, requests } = recordingClient((path) =>
      path.endsWith("/points") ? pointPayload() : areaPayload(),
    );
    await loadMapSetup(client, LOCATION_ID, controller.signal);
    for (const request of requests) {
      expect(request.options.signal).toBe(controller.signal);
    }
  });

  it("never issues a DELETE request across every supported operation", async () => {
    const { client, requests } = recordingClient((path, options) => {
      // Collection URLs answer with lists on GET; entity/mutation URLs always
      // answer with a bare entity of the matching kind.
      const isRead = options.method === undefined;
      if (path.includes("/points")) {
        return path.endsWith("/points") && isRead
          ? pointPayload()
          : singlePointPayload();
      }
      return path.endsWith("/areas") && isRead
        ? areaPayload()
        : singleAreaPayload();
    });
    const vertices = [
      { latitude: 1, longitude: 2 },
      { latitude: 3, longitude: 4 },
      { latitude: 5, longitude: 6 },
    ];
    await fetchMapPoints(client, LOCATION_ID);
    await fetchMapAreas(client, LOCATION_ID);
    await createMapPoint(client, LOCATION_ID, {
      active: true,
      code: "X",
      kind: "ENTRANCE",
      label: "X",
      latitude: 1,
      levelLabel: null,
      longitude: 2,
    });
    await updateMapPoint(client, LOCATION_ID, POINT_ID, { active: false });
    await createMapArea(client, LOCATION_ID, {
      active: true,
      code: "A",
      label: "A",
      levelLabel: null,
      parkingZoneId: null,
      purpose: "PARKING",
      vertices,
    });
    await updateMapArea(client, LOCATION_ID, AREA_ID, { label: "Y" });
    await replaceMapAreaVertices(client, LOCATION_ID, AREA_ID, { vertices });
    expect(requests).toHaveLength(7);
    const methods = new Set(
      requests.map((request) => request.options.method ?? "GET"),
    );
    // The backend exposes no delete operation; the client must not either.
    expect(methods.has("DELETE")).toBe(false);
    expect([...methods].sort()).toEqual(["GET", "PATCH", "POST", "PUT"]);
  });
});
