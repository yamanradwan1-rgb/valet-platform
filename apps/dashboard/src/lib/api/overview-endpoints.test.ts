import { afterEach, describe, expect, it, vi } from "vitest";

import { sessionOverviewListResponseSchema } from "@valet/contracts";

import { DashboardApiError } from "./api-error";
import {
  fetchOverviewPage,
  OVERVIEW_PAGE_LIMIT,
  overviewListPath,
  overviewPageQuery,
} from "./overview-endpoints";
import { StaffApiClient } from "./staff-api-client";

const LOCATION_ID = "0f0a6a7e-0b1c-4d2e-8f30-111111111111";

function client(): StaffApiClient {
  return new StaffApiClient({
    baseUrl: "http://test",
    getAccessToken: () => "token",
    recoverFromUnauthorized: async () => null,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("overviewListPath", () => {
  it("targets the exact backend overview list routes", () => {
    expect(overviewListPath(LOCATION_ID, "sessions")).toBe(
      `/dashboard/locations/${LOCATION_ID}/overview/sessions`,
    );
    expect(overviewListPath(LOCATION_ID, "retrieval-queue")).toBe(
      `/dashboard/locations/${LOCATION_ID}/overview/retrieval-queue`,
    );
    expect(overviewListPath(LOCATION_ID, "tasks")).toBe(
      `/dashboard/locations/${LOCATION_ID}/overview/tasks`,
    );
  });
});

describe("overviewPageQuery", () => {
  it("sends no cursor parameter on the initial request", () => {
    expect(overviewPageQuery({ cursor: null })).toBe(
      `?limit=${OVERVIEW_PAGE_LIMIT}`,
    );
    expect(overviewPageQuery()).toBe(`?limit=${OVERVIEW_PAGE_LIMIT}`);
  });

  it("echoes the opaque server cursor verbatim (never decoded or rebuilt)", () => {
    const cursor = "eyJ2IjoxLCJkIjoic2Vzc2lvbnMiLCJhIjoiMjAyNiIsImIiOiJhIn00";
    expect(overviewPageQuery({ cursor })).toBe(
      `?limit=${OVERVIEW_PAGE_LIMIT}&cursor=${cursor}`,
    );
  });

  it("clamps the requested page size into the backend contract range", () => {
    expect(overviewPageQuery({ limit: 500 })).toContain("limit=100");
    expect(overviewPageQuery({ limit: 0 })).toContain("limit=1");
    expect(overviewPageQuery({ limit: 25 })).toContain("limit=25");
  });
});

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("fetchOverviewPage", () => {
  it("returns the parsed contract response for a valid payload", async () => {
    let capturedUrl = "";
    let capturedInit: RequestInit | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async (url: string, init?: RequestInit): Promise<Response> => {
          capturedUrl = url;
          capturedInit = init;
          return jsonResponse({
            items: [
              {
                sessionId: "2dc14878-df98-4d0f-b164-bc2506a6b101",
                state: "PARKED",
                createdAt: "2026-08-24T09:14:00Z",
                updatedAt: "2026-08-24T09:22:00Z",
                keySlotId: null,
                parkingSpotId: null,
                currentAssigneeMembershipId: null,
                vehicle: {
                  vehicleId: "6225b06f-d0fd-4c02-a59c-b0388094b101",
                  plateCountry: null,
                  plateNumberNormalized: null,
                  temporaryDescriptor: null,
                },
              },
            ],
            nextCursor: null,
          });
        },
      ),
    );

    const page = await fetchOverviewPage(
      client(),
      overviewListPath(LOCATION_ID, "sessions"),
      sessionOverviewListResponseSchema,
      { cursor: null },
    );

    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).toBeNull();
    expect(capturedUrl).toContain(
      `/overview/sessions?limit=${OVERVIEW_PAGE_LIMIT}`,
    );
    expect(capturedInit?.method).toBe("GET");
  });

  it("raises an honest server failure when the shape drifts from the contract", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ items: "not-an-array" })),
    );
    await expect(
      fetchOverviewPage(
        client(),
        overviewListPath(LOCATION_ID, "tasks"),
        sessionOverviewListResponseSchema,
      ),
    ).rejects.toMatchObject({
      code: "RESPONSE_CONTRACT_INVALID",
    });
    await expect(
      fetchOverviewPage(
        client(),
        overviewListPath(LOCATION_ID, "tasks"),
        sessionOverviewListResponseSchema,
      ),
    ).rejects.toBeInstanceOf(DashboardApiError);
  });
});
