import type { NativeAuthSession } from "@valet/employee-client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { nativeOnlineHint } from "../src/shift/native-shift-connectivity";
import { createNativeShiftEndTransport } from "../src/tasks/native-operational-http";

const accessToken = `vsa1.${"a".repeat(43)}`;
const ids = {
  location: "11111111-1111-4111-8111-111111111111",
  shift: "55555555-5555-4555-8555-555555555555",
};

function auth() {
  return {
    current: vi.fn(() => ({ authGeneration: 1, phase: "authenticated" })),
    getAccessToken: vi.fn(() => accessToken),
    handleDefinitiveAuthorizationLoss: vi.fn(async () => undefined),
    refresh: vi.fn(async () => "refreshed" as const),
  } as unknown as NativeAuthSession;
}

function endedShiftResponse() {
  return {
    cashReconciliation: {
      cashExpected: "9.000",
      cashReported: "10.000",
      cashVariance: "1.000",
      currency: "JOD",
      reportedAt: "2026-09-03T16:00:00.000Z",
    },
    endedAt: "2026-09-03T16:00:00.000Z",
    locationId: ids.location,
    shiftId: ids.shift,
    startedAt: "2026-09-03T08:00:00.000Z",
    status: "ENDED",
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Native End Shift HTTP transport", () => {
  it("uses a conservative platform online hint without requiring the global", () => {
    vi.stubGlobal("navigator", undefined);
    expect(nativeOnlineHint()).toBe(true);
    vi.stubGlobal("navigator", { onLine: false });
    expect(nativeOnlineHint()).toBe(false);
  });

  it("sends the exact route and strict cashReported body once", async () => {
    vi.stubGlobal("__DEV__", false);
    const fetchMock = vi.fn(async () => Response.json(endedShiftResponse()));
    vi.stubGlobal("fetch", fetchMock);
    const transport = createNativeShiftEndTransport(
      "https://api.example.com",
      auth(),
    );

    await expect(transport.endShift(ids.shift, "10.000")).resolves.toEqual(
      endedShiftResponse(),
    );
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      `https://api.example.com/v1/staff/shifts/${ids.shift}/end`,
      expect.objectContaining({
        body: JSON.stringify({ cashReported: "10.000" }),
        method: "POST",
      }),
    );
  });

  it("rejects malformed success instead of fabricating ENDED", async () => {
    vi.stubGlobal("__DEV__", false);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ status: "ENDED" })),
    );
    const transport = createNativeShiftEndTransport(
      "https://api.example.com",
      auth(),
    );

    await expect(transport.endShift(ids.shift, "10.000")).rejects.toMatchObject(
      { code: "SHIFT_END_RESPONSE_INVALID" },
    );
  });
});
