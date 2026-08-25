import { describe, expect, it } from "vitest";

import type { StaffApiClient } from "../../lib/api/staff-api-client";
import { DashboardApiError } from "../../lib/api/api-error";
import {
  fetchLiveOperationsPage,
  LIVE_OPERATIONS_PAGE_LIMIT,
  liveOperationsPath,
  type LiveOperationsItem,
} from "./live-operations-api";

const LOCATION_ID = "5f0f3f4e-9d6a-4a1c-8f2e-1b2c3d4e5f60";

interface RecordedRequest {
  readonly path: string;
  readonly signal: AbortSignal | undefined;
}

function stubClient(handler: (path: string) => unknown): {
  client: StaffApiClient;
  requests: RecordedRequest[];
} {
  const requests: RecordedRequest[] = [];
  const client = {
    async request<T>(path: string, options?: {
      signal?: AbortSignal;
    }): Promise<T> {
      requests.push({ path, signal: options?.signal });
      return handler(path) as T;
    },
  };
  return { client: client as unknown as StaffApiClient, requests };
}

const AREA = {
  code: "PARK_A",
  label: "Parking Area A",
  levelLabel: "B1",
  mapAreaId: "1ab9a51b-221c-4620-9ce8-29e7ee91a101",
  parkingZoneId: "833c8578-76f5-4c7e-8228-5c715e2fa101",
  purpose: "PARKING",
} as const;

function liveItem(
  overrides: Partial<LiveOperationsItem> = {},
): LiveOperationsItem {
  return {
    assigneeMembershipId: "eb39db89-54d2-45fa-a64e-29f89688f102",
    position: {
      areas: [{ ...AREA }],
      capturedAt: "2026-08-24T20:21:42+03:00",
      freshness: "LIVE",
      latitude: 32.562703,
      longitude: 35.880055,
    },
    sessionState: "RETRIEVING",
    taskId: "59220eb7-d188-4c7f-ab9e-a4779a6af101",
    taskType: "RETRIEVAL",
    trackingSessionId: "84e8d092-72d9-4a70-bd41-b24f49d1a101",
    valetSessionId: "2dc14878-df98-4d0f-b164-bc2506a6b102",
    vehicle: {
      color: "Black",
      make: "Toyota",
      model: "Land Cruiser",
      plateCountry: "JO",
      plateNumber: "34-B-7890",
      temporaryDescriptor: null,
      vehicleId: "6225b06f-d0fd-4c02-a59c-b0388094b102",
    },
    ...overrides,
  };
}

function responsePayload(overrides: {
  items?: unknown[];
  nextCursor?: string | null;
  observedAt?: string;
} = {}): Record<string, unknown> {
  return {
    items: overrides.items ?? [liveItem()],
    nextCursor: overrides.nextCursor ?? null,
    observedAt: overrides.observedAt ?? "2026-08-24T20:21:45+03:00",
  };
}

describe("live operations endpoint wiring", () => {
  it("requests exactly the verified backend route with an explicit limit", async () => {
    const { client, requests } = stubClient(() => responsePayload());
    await fetchLiveOperationsPage(client, LOCATION_ID, null, new AbortController().signal);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.path).toBe(
      `${liveOperationsPath(LOCATION_ID)}?limit=${LIVE_OPERATIONS_PAGE_LIMIT}`,
    );
    expect(requests[0]?.signal).toBeInstanceOf(AbortSignal);
  });

  it("echoes the opaque server cursor verbatim without decoding it", async () => {
    const { client, requests } = stubClient(() =>
      responsePayload({ nextCursor: "c2VydmVyIHRva2Vu+/==" }),
    );
    await fetchLiveOperationsPage(
      client,
      LOCATION_ID,
      "c2VydmVyIHRva2Vu+/==",
      new AbortController().signal,
    );
    const path = requests[0]?.path ?? "";
    expect(path.startsWith(`/locations/${LOCATION_ID}/live-operations-map?`)).toBe(true);
    const params = new URLSearchParams(path.split("?")[1] ?? "");
    expect(params.get("cursor")).toBe("c2VydmVyIHRva2Vu+/==");
    expect(params.get("limit")).toBe(String(LIVE_OPERATIONS_PAGE_LIMIT));
  });
});

describe("live operations contract parsing", () => {
  it("parses a positioned LIVE retrieval item with unchanged coordinates", async () => {
    const { client } = stubClient(() => responsePayload());
    const page = await fetchLiveOperationsPage(client, LOCATION_ID, null, new AbortController().signal);
    expect(page.observedAt).toBe("2026-08-24T20:21:45+03:00");
    const row = page.items[0];
    expect(row?.taskType).toBe("RETRIEVAL");
    expect(row?.sessionState).toBe("RETRIEVING");
    expect(row?.position?.freshness).toBe("LIVE");
    // Coordinates pass through unchanged; no rounding or inference.
    expect(row?.position?.latitude).toBe(32.562703);
    expect(row?.position?.longitude).toBe(35.880055);
    expect(row?.position?.capturedAt).toBe("2026-08-24T20:21:42+03:00");
    expect(row?.position?.areas[0]?.label).toBe("Parking Area A");
  });

  it("accepts a nullable position alongside STALE/PARKING facts", async () => {
    const unpositioned = liveItem({
      trackingSessionId: "84e8d092-72d9-4a70-bd41-b24f49d1a102",
      taskId: "59220eb7-d188-4c7f-ab9e-a4779a6af103",
      taskType: "PARKING",
      sessionState: "PARKING",
      position: null,
      vehicle: {
        color: null,
        make: null,
        model: null,
        plateCountry: null,
        plateNumber: null,
        temporaryDescriptor: "Blue SUV",
        vehicleId: "6225b06f-d0fd-4c02-a59c-b0388094b106",
      },
    });
    const stale = liveItem({
      trackingSessionId: "84e8d092-72d9-4a70-bd41-b24f49d1a103",
      taskId: "59220eb7-d188-4c7f-ab9e-a4779a6af104",
      taskType: "PARKING",
      sessionState: "PARKING",
      position: {
        areas: [],
        capturedAt: "2026-08-24T20:19:54+03:00",
        freshness: "STALE",
        latitude: -31.95402,
        longitude: -35.91089,
      },
    });
    const { client } = stubClient(() =>
      responsePayload({ items: [unpositioned, stale] }),
    );
    const page = await fetchLiveOperationsPage(client, LOCATION_ID, null, new AbortController().signal);
    expect(page.items[0]?.position).toBeNull();
    expect(page.items[1]?.position?.freshness).toBe("STALE");
    expect(page.items[1]?.taskType).toBe("PARKING");
  });

  it("parses empty live operations with an exhausted cursor", async () => {
    const { client } = stubClient(() =>
      responsePayload({ items: [], nextCursor: null }),
    );
    const page = await fetchLiveOperationsPage(client, LOCATION_ID, null, new AbortController().signal);
    expect(page.items).toHaveLength(0);
    expect(page.nextCursor).toBeNull();
  });

  it("rejects payloads that violate the shared contract as server failures", async () => {
    // Raw (deliberately contract-breaking) position payloads.
    const rawPosition = (
      freshness: string,
      latitude: number,
    ): Record<string, unknown> => ({
      areas: [],
      capturedAt: "2026-08-24T20:19:54+03:00",
      freshness,
      latitude,
      longitude: 35,
    });
    const withRawItem = (position: Record<string, unknown>): unknown =>
      responsePayload({
        items: [{ ...liveItem(), position }],
      });
    const invalidVariants: unknown[] = [
      // missing top-level observedAt
      { items: [], nextCursor: null },
      // freshness outside the backend enum
      withRawItem(rawPosition("FRESH", 32)),
      // unknown additional key (strict schema)
      { ...responsePayload(), surprise: true },
      // out-of-range latitude
      withRawItem(rawPosition("LIVE", 91)),
      // assigneeMembershipId is NON-NULL in the verified contract; a null
      // (unassigned) item must surface as contract drift, not a rendered row.
      {
        ...responsePayload({
          items: [{ ...liveItem(), assigneeMembershipId: null }],
        }),
      },
    ];
    for (const payload of invalidVariants) {
      const { client } = stubClient(() => payload);
      const failure = await fetchLiveOperationsPage(
        client,
        LOCATION_ID,
        null,
        new AbortController().signal,
      ).then(
        () => null,
        (error: unknown) => error,
      );
      expect(failure).toBeInstanceOf(DashboardApiError);
      expect((failure as DashboardApiError).code).toBe(
        "RESPONSE_CONTRACT_INVALID",
      );
    }
  });
});
