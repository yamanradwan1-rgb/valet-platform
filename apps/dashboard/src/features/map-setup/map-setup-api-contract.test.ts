import { describe, expect, it } from "vitest";

import {
  createMapPoint,
  fetchMapAreas,
  fetchMapPoints,
  replaceMapAreaVertices,
  type MapSetupClient,
} from "./map-setup-api";

const LOCATION_ID = "5f0f3f4e-9d6a-4a1c-8f2e-1b2c3d4e5f60";
const AREA_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

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
  responder: () => unknown,
): { client: MapSetupClient; requests: RecordedRequest[] } {
  const requests: RecordedRequest[] = [];
  const client: MapSetupClient = {
    async request<T>(
      path: string,
      options: RecordedRequestOptions = {},
    ): Promise<T> {
      requests.push({ options, path });
      return responder() as T;
    },
  };
  return { client, requests };
}

function pointPayload(): unknown {
  return { points: [] };
}

describe("map setup contract enforcement", () => {
  it("rejects a malformed points payload with an honest diagnostic", async () => {
    const { client } = recordingClient(() => ({ points: [{ broken: true }] }));
    await expect(fetchMapPoints(client, LOCATION_ID)).rejects.toMatchObject({
      code: "MAP_SETUP_POINTS_RESPONSE_INVALID",
    });
  });

  it("rejects a malformed areas payload with an honest diagnostic", async () => {
    const { client } = recordingClient(() => ({ areas: [{ nonsense: true }] }));
    await expect(fetchMapAreas(client, LOCATION_ID)).rejects.toMatchObject({
      code: "MAP_SETUP_AREAS_RESPONSE_INVALID",
    });
  });

  it("rejects mutation responses that violate the entity schemas", async () => {
    const { client } = recordingClient(() => ({ nonsense: true }));
    await expect(
      createMapPoint(client, LOCATION_ID, {
        active: true,
        code: "X",
        kind: "ENTRANCE",
        label: "X",
        latitude: 0,
        levelLabel: null,
        longitude: 0,
      }),
    ).rejects.toMatchObject({ code: "MAP_SETUP_POINT_RESPONSE_INVALID" });
    await expect(
      replaceMapAreaVertices(client, LOCATION_ID, AREA_ID, {
        vertices: [
          { latitude: 1, longitude: 2 },
          { latitude: 3, longitude: 4 },
          { latitude: 5, longitude: 6 },
        ],
      }),
    ).rejects.toMatchObject({ code: "MAP_SETUP_AREA_RESPONSE_INVALID" });
  });

  it("refuses to send payloads that violate the shared request schemas", async () => {
    const { client, requests } = recordingClient(() => pointPayload());
    await expect(
      createMapPoint(client, LOCATION_ID, {
        active: true,
        code: "",
        kind: "GARAGE" as never,
        label: "X",
        latitude: 0,
        levelLabel: null,
        longitude: 0,
      }),
    ).rejects.toMatchObject({ code: "MAP_SETUP_REQUEST_INVALID" });
    expect(requests).toHaveLength(0);
  });

  it("encodes the location id into every path", async () => {
    const oddLocationId = "5f0f3f4e-9d6a-4a1c-8f2e-1b2c3d4e5f60";
    const { client, requests } = recordingClient(() => pointPayload());
    await fetchMapPoints(client, oddLocationId);
    expect(requests[0]?.path.startsWith("/v1/staff/locations/")).toBe(true);
    expect(decodeURIComponent(requests[0]?.path ?? "")).toContain(oddLocationId);
  });
});
