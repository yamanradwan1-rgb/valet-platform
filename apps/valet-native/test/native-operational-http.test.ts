import { afterEach, describe, expect, it, vi } from "vitest";
import type { NativeAuthSession } from "@valet/employee-client";

import {
  createNativeOperationalTransport,
  createNativeShiftStartTransport,
} from "../src/tasks/native-operational-http";

const accessToken = `vsa1.${"a".repeat(43)}`;
const ids = {
  location: "11111111-1111-4111-8111-111111111111",
  membership: "22222222-2222-4222-8222-222222222222",
  organization: "33333333-3333-4333-8333-333333333333",
  session: "44444444-4444-4444-8444-444444444444",
  shift: "55555555-5555-4555-8555-555555555555",
  task: "66666666-6666-4666-8666-666666666666",
};

function auth() {
  return {
    current: vi.fn(() => ({ authGeneration: 1, phase: "authenticated" })),
    getAccessToken: vi.fn(() => accessToken),
    handleDefinitiveAuthorizationLoss: vi.fn(async () => undefined),
    refresh: vi.fn(async () => "refreshed" as const),
  } as unknown as NativeAuthSession;
}

function contextResponse() {
  return {
    contexts: [
      {
        activeShift: {
          locationId: ids.location,
          shiftId: ids.shift,
          startedAt: "2026-09-03T08:00:00.000Z",
          status: "ACTIVE",
        },
        currentLocation: {
          code: "AMM-1",
          currency: "JOD",
          locationId: ids.location,
          name: "Amman Hotel",
        },
        eligibleLocations: [],
        membershipId: ids.membership,
        organization: { name: "Operator", organizationId: ids.organization },
        role: "VALET_EMPLOYEE",
      },
    ],
  };
}

function acceptedResponse() {
  return {
    createdAt: "2026-09-03T08:05:00.000Z",
    currentAssigneeMembershipId: ids.membership,
    sessionId: ids.session,
    status: "ACCEPTED",
    taskId: ids.task,
    taskType: "PARKING",
    version: 3,
  };
}

function startedShiftResponse() {
  return {
    endedAt: null,
    locationId: ids.location,
    shiftId: ids.shift,
    startedAt: "2026-09-03T08:00:00.000Z",
    status: "ACTIVE",
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Native operational HTTP transport", () => {
  it("sends the exact Start Shift route and targetLocationId contract once", async () => {
    vi.stubGlobal("__DEV__", false);
    const fetchMock = vi.fn(async () => Response.json(startedShiftResponse()));
    vi.stubGlobal("fetch", fetchMock);
    const transport = createNativeShiftStartTransport(
      "https://api.example.com",
      auth(),
    );

    await expect(transport.startShift(ids.location)).resolves.toEqual(
      startedShiftResponse(),
    );
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      "https://api.example.com/v1/staff/shifts/start",
      expect.objectContaining({
        body: JSON.stringify({ targetLocationId: ids.location }),
        method: "POST",
      }),
    );
  });

  it("rejects a malformed Start Shift response without inventing active state", async () => {
    vi.stubGlobal("__DEV__", false);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ status: "ACTIVE" })),
    );
    const transport = createNativeShiftStartTransport(
      "https://api.example.com",
      auth(),
    );

    await expect(transport.startShift(ids.location)).rejects.toMatchObject({
      code: "NATIVE_OPERATIONAL_RESPONSE_INVALID",
    });
  });

  it("returns validated context without publishing transport side effects", async () => {
    vi.stubGlobal("__DEV__", false);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(contextResponse())),
    );
    const transport = createNativeOperationalTransport(
      "https://api.example.com",
      auth(),
    );

    await expect(transport.loadOperationalContext()).resolves.toEqual(
      contextResponse(),
    );
  });

  it("loads authenticated context and exact Location-scoped queue routes", async () => {
    vi.stubGlobal("__DEV__", false);
    const requests: Array<{
      init: RequestInit | undefined;
      url: string;
    }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        requests.push({ init, url: String(url) });
        return Response.json(
          String(url).includes("operational-context")
            ? contextResponse()
            : { tasks: [] },
        );
      }),
    );
    const transport = createNativeOperationalTransport(
      "https://api.example.com",
      auth(),
    );

    await transport.loadOperationalContext();
    await transport.loadTaskQueue(ids.location);

    expect(requests.map(({ url }) => url)).toEqual([
      "https://api.example.com/v1/staff/operational-context",
      `https://api.example.com/v1/staff/tasks/queue?locationId=${ids.location}`,
    ]);
    expect(requests[0]?.init?.headers).toMatchObject({
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    });
  });

  it("sends self-accept once with only expectedVersion", async () => {
    vi.stubGlobal("__DEV__", false);
    const fetchMock = vi.fn(async () => Response.json(acceptedResponse()));
    vi.stubGlobal("fetch", fetchMock);
    const transport = createNativeOperationalTransport(
      "https://api.example.com",
      auth(),
    );

    await transport.acceptTask(ids.task, 2);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      `https://api.example.com/v1/staff/tasks/${ids.task}/accept`,
      expect.objectContaining({
        body: JSON.stringify({ expectedVersion: 2 }),
        method: "POST",
      }),
    );
  });

  it("sends self-assignment once with only the current expectedVersion", async () => {
    vi.stubGlobal("__DEV__", false);
    const fetchMock = vi.fn(async () =>
      Response.json({ ...acceptedResponse(), status: "ASSIGNED" }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const transport = createNativeOperationalTransport(
      "https://api.example.com",
      auth(),
    );

    await transport.assignTask(ids.task, 2);

    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      `https://api.example.com/v1/staff/tasks/${ids.task}/assign`,
      expect.objectContaining({
        body: JSON.stringify({ expectedVersion: 2 }),
        method: "POST",
      }),
    );
  });

  it("rejects a malformed queue projection instead of fabricating empty state", async () => {
    vi.stubGlobal("__DEV__", false);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ tasks: [{ taskId: ids.task }] })),
    );
    const transport = createNativeOperationalTransport(
      "https://api.example.com",
      auth(),
    );

    await expect(transport.loadTaskQueue(ids.location)).rejects.toMatchObject({
      code: "NATIVE_OPERATIONAL_RESPONSE_INVALID",
    });
  });

  it("refreshes and retries a safe GET exactly once", async () => {
    vi.stubGlobal("__DEV__", false);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(
          { code: "STAFF_AUTHENTICATION_REQUIRED", message: "Expired" },
          { status: 401 },
        ),
      )
      .mockResolvedValueOnce(Response.json(contextResponse()));
    vi.stubGlobal("fetch", fetchMock);
    const authSession = auth();
    const transport = createNativeOperationalTransport(
      "https://api.example.com",
      authSession,
    );

    await transport.loadOperationalContext();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(authSession.refresh).toHaveBeenCalledTimes(1);
  });

  it("never refreshes or replays a rejected POST", async () => {
    vi.stubGlobal("__DEV__", false);
    const fetchMock = vi.fn(async () =>
      Response.json(
        { code: "STAFF_AUTHENTICATION_REQUIRED", message: "Expired" },
        { status: 401 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const authSession = auth();
    const transport = createNativeOperationalTransport(
      "https://api.example.com",
      authSession,
    );

    await expect(transport.acceptTask(ids.task, 2)).rejects.toMatchObject({
      code: "STAFF_AUTHENTICATION_REQUIRED",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(authSession.refresh).not.toHaveBeenCalled();
    expect(authSession.handleDefinitiveAuthorizationLoss).toHaveBeenCalledTimes(
      1,
    );
    expect(authSession.handleDefinitiveAuthorizationLoss).toHaveBeenCalledWith(
      1,
    );
  });
});
