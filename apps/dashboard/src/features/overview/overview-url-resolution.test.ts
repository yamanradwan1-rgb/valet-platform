import { afterEach, describe, expect, it, vi } from "vitest";

import { StaffApiClient } from "../../lib/api/staff-api-client";
import {
  fetchFinancialOverview,
  fetchQueueSnapshot,
  fetchSessionStateCounts,
  loadOverviewComposition,
} from "./overview-api";

/**
 * REAL URL-resolution proof at the StaffApiClient transport boundary.
 *
 * A stubbed Pick<StaffApiClient,"request"> only records the SUPPLIED path and
 * can never catch a base/path double prefix. These tests run the real client
 * (browser base `/v1/staff`, exactly what api-config resolves in the browser)
 * against a stubbed global fetch and assert the FINAL resolved URL:
 *
 *   /v1/staff  +  /dashboard/locations/:id/...
 *   = /v1/staff/dashboard/...           (exactly one prefix, never
 *                                        /v1/staff/v1/staff/...)
 */
const BROWSER_BASE = "/v1/staff";
const LOCATION_ID = "5f0f3f4e-9d6a-4a1c-8f2e-1b2c3d4e5f60";

function stateCountsPayload(): unknown {
  return {
    counts: [
      { count: 0, state: "CHECKING_IN" },
      { count: 0, state: "AWAITING_PARKING" },
      { count: 0, state: "PARKING" },
      { count: 0, state: "PARKED" },
      { count: 0, state: "REQUESTED" },
      { count: 0, state: "RETRIEVING" },
      { count: 0, state: "READY" },
      { count: 0, state: "HANDOFF_PENDING" },
      { count: 0, state: "COMPLETED" },
    ],
  };
}

function payloadFor(path: string): unknown {
  if (path.endsWith("/overview/session-state-counts")) {
    return stateCountsPayload();
  }
  if (path.endsWith("/analytics/queue")) {
    return { depth: 0, oldestAgeSeconds: null };
  }
  return { currencies: [] };
}

function makeRealClient(): StaffApiClient {
  return new StaffApiClient({
    baseUrl: BROWSER_BASE,
    getAccessToken: () => `vsa1.${"A".repeat(43)}`,
    recoverFromUnauthorized: async () => null,
  });
}

function stubFetchRecordingUrls(): { urls: string[] } {
  const urls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string | URL) => {
      urls.push(String(url));
      const path = String(url).replace(BROWSER_BASE, "");
      const body = JSON.stringify(payloadFor(path));
      return Promise.resolve({
        ok: true,
        status: 200,
        text: async () => body,
      });
    }),
  );
  return { urls };
}

function expectSingleStaffPrefix(url: string): void {
  expect(url.startsWith(`${BROWSER_BASE}/`)).toBe(true);
  expect(url.split("/v1/staff").length - 1).toBe(1);
  expect(url.includes("/v1/staff/v1/staff")).toBe(false);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("resolved Overview URLs through the real StaffApiClient", () => {
  it("resolves session-state-counts to exactly one /v1/staff prefix", async () => {
    const { urls } = stubFetchRecordingUrls();
    await fetchSessionStateCounts(makeRealClient(), LOCATION_ID);
    expect(urls).toEqual([
      `${BROWSER_BASE}/dashboard/locations/${LOCATION_ID}/overview/session-state-counts`,
    ]);
    expectSingleStaffPrefix(urls[0] ?? "");
  });

  it("resolves the queue snapshot to exactly one /v1/staff prefix", async () => {
    const { urls } = stubFetchRecordingUrls();
    await fetchQueueSnapshot(makeRealClient(), LOCATION_ID);
    expect(urls).toEqual([
      `${BROWSER_BASE}/dashboard/locations/${LOCATION_ID}/analytics/queue`,
    ]);
    expectSingleStaffPrefix(urls[0] ?? "");
  });

  it("resolves financial to exactly one /v1/staff prefix", async () => {
    const { urls } = stubFetchRecordingUrls();
    await fetchFinancialOverview(makeRealClient(), LOCATION_ID);
    expect(urls).toEqual([
      `${BROWSER_BASE}/dashboard/locations/${LOCATION_ID}/overview/financial`,
    ]);
    expectSingleStaffPrefix(urls[0] ?? "");
  });

  it("resolves the whole composition to exactly its three backend endpoints", async () => {
    const { urls } = stubFetchRecordingUrls();
    await loadOverviewComposition(makeRealClient(), LOCATION_ID);
    expect([...urls].sort()).toEqual(
      [
        `${BROWSER_BASE}/dashboard/locations/${LOCATION_ID}/overview/session-state-counts`,
        `${BROWSER_BASE}/dashboard/locations/${LOCATION_ID}/analytics/queue`,
        `${BROWSER_BASE}/dashboard/locations/${LOCATION_ID}/overview/financial`,
      ].sort(),
    );
    for (const url of urls) {
      expectSingleStaffPrefix(url);
    }
  });

  it("preserves percent-encoding of non-trivial location ids after resolution", async () => {
    const { urls } = stubFetchRecordingUrls();
    const rawId = "loc with space/?id=1&x";
    await fetchQueueSnapshot(makeRealClient(), rawId);
    // The supplied path encodes the id; the resolved URL keeps that encoding
    // intact instead of decoding or re-encoding any segment.
    expect(urls).toEqual([
      `${BROWSER_BASE}/dashboard/locations/${encodeURIComponent(rawId)}/analytics/queue`,
    ]);
    expectSingleStaffPrefix(urls[0] ?? "");
  });

  it("keeps bearer injection and single retry semantics on resolved requests", async () => {
    let call = 0;
    const seenAuth: Array<string | undefined> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string | URL, init?: RequestInit) => {
        const headers = (init?.headers ?? {}) as Record<string, string>;
        seenAuth.push(headers["Authorization"]);
        call += 1;
        if (call === 1) {
          return Promise.resolve({
            ok: false,
            status: 401,
            text: async () =>
              JSON.stringify({ code: "STAFF_AUTHENTICATION_REQUIRED" }),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({ depth: 0, oldestAgeSeconds: null }),
        });
      }),
    );

    let recovered = false;
    let currentToken = `vsa1.${"B".repeat(43)}`;
    const client = new StaffApiClient({
      baseUrl: BROWSER_BASE,
      // Mirrors the production wiring: requestOnce re-reads the live runtime
      // token at send time, so the retry picks up the recovered credential.
      getAccessToken: () => currentToken,
      recoverFromUnauthorized: async () => {
        recovered = true;
        currentToken = `vsa1.${"C".repeat(43)}`;
        return currentToken;
      },
    });

    const queue = await fetchQueueSnapshot(client, LOCATION_ID);
    expect(queue.depth).toBe(0);
    expect(recovered).toBe(true);
    expect(seenAuth).toHaveLength(2);
    expect(seenAuth[0]).toBe(`Bearer vsa1.${"B".repeat(43)}`);
    expect(seenAuth[1]).toBe(`Bearer vsa1.${"C".repeat(43)}`);
  });
});
