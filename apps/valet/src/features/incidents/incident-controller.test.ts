import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StaffAuthClient } from "../../lib/auth/staff-auth-client";
import { EmployeeApiClient } from "../../lib/api/employee-api-client";
import {
  IncidentController,
} from "./incident-controller";
import { reportIncident } from "./incident-api";

const sessionId = "11111111-1111-4111-8111-111111111111";
const okResponse = {
  createdAt: "2026-08-22T12:00:00.000Z",
  incidentId: "99999999-9999-4999-8999-999999999999",
  reportedByMembershipId: "88888888-8888-4888-8888-888888888888",
  sessionId,
  severity: "MEDIUM" as const,
  status: "OPEN" as const,
  type: "VEHICLE_DAMAGE" as const,
};

describe("incident API contract", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("POSTs the canonical staff incidents route with the stable body", async () => {
    let capturedUrl = "";
    let capturedInit: RequestInit | undefined;
    globalThis.fetch = vi.fn(
      async (url: string | URL | RequestInfo, init?: RequestInit) => {
        capturedUrl = String(url);
        capturedInit = init;
        return new Response(JSON.stringify(okResponse), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        });
      },
    ) as unknown as typeof fetch;

    const authClient = new StaffAuthClient();
    vi.spyOn(authClient, "isTokenFresh").mockReturnValue(true);
    vi.spyOn(authClient, "getAccessToken").mockReturnValue("vsa1_token");
    const client = new EmployeeApiClient({ authClient });

    const res = await reportIncident(client, sessionId, {
      description: "Scratched rim.",
      incidentId: okResponse.incidentId,
      severity: "MEDIUM",
      type: "VEHICLE_DAMAGE",
    });

    expect(res.incidentId).toBe(okResponse.incidentId);
    expect(capturedUrl).toBe(
      `/v1/staff/valet-sessions/${sessionId}/incidents`,
    );
    expect(capturedInit?.method).toBe("POST");
    expect(JSON.parse(String(capturedInit?.body))).toEqual({
      description: "Scratched rim.",
      incidentId: okResponse.incidentId,
      severity: "MEDIUM",
      type: "VEHICLE_DAMAGE",
    });
  });
});

describe("IncidentController stable retry identity", () => {
  function setup(responses: Array<unknown | Error>) {
    const request = vi.fn();
    responses.forEach((r) =>
      request.mockImplementationOnce(() =>
        r instanceof Error ? Promise.reject(r) : Promise.resolve(r),
      ),
    );
    const controller = new IncidentController(
      { request } as unknown as EmployeeApiClient,
      () => undefined,
    );
    return { controller, request };
  }

  const input = {
    description: "Scratched rim.",
    sessionId,
    severity: "MEDIUM" as const,
    type: "VEHICLE_DAMAGE" as const,
  };

  it("reuses the SAME incidentId across a lost response and succeeds on retry", async () => {
    const networkLoss = Object.assign(new Error("offline"), {
      name: "EmployeeApiError",
    });
    const { controller, request } = setup([networkLoss, okResponse]);
    await controller.submit(input);
    expect(controller.getState().phase).toBe("idle");
    expect(controller.getState().report).toBeNull();

    await controller.submit(input);
    expect(controller.getState().phase).toBe("reported");
    const bodies = request.mock.calls.map(
      (call) => (call[1] as { body: unknown }).body,
    );
    expect(bodies).toHaveLength(2);
    expect((bodies[0] as { incidentId: string }).incidentId).toBe(
      (bodies[1] as { incidentId: string }).incidentId,
    );
  });

  it("blocks double submit to one mutation and clears the id after success", async () => {
    let release!: (v: unknown) => void;
    const pending = new Promise<unknown>((r) => {
      release = r;
    });
    const request = vi.fn().mockImplementation(() => pending);
    const controller = new IncidentController(
      { request } as unknown as EmployeeApiClient,
      () => undefined,
    );

    const first = controller.submit(input);
    void controller.submit(input);
    release(okResponse);
    await first;

    expect(request).toHaveBeenCalledTimes(1);
    expect(controller.getState().phase).toBe("reported");

    // New logical report gets a fresh id.
    (request as ReturnType<typeof vi.fn>).mockResolvedValueOnce(okResponse);
    await controller.submit(input);
    const bodies = request.mock.calls.map(
      (call) => (call[1] as { body: unknown }).body,
    );
    expect(
      (bodies[0] as { incidentId: string }).incidentId,
    ).not.toBe((bodies[1] as { incidentId: string }).incidentId);
  });

  it("never enters reported phase on failure", async () => {
    const { controller } = setup([
      new Error("Staff session service temporarily unavailable."),
    ]);
    await controller.submit(input);
    expect(controller.getState().phase).toBe("idle");
    expect(controller.getState().error).toContain("unavailable");
  });
});

describe("IncidentController secure-UUID fail-closed guard", () => {
  const input = {
    description: "Scratched rim.",
    sessionId: "11111111-1111-4111-8111-111111111111",
    severity: "MEDIUM" as const,
    type: "VEHICLE_DAMAGE" as const,
  };

  function withCrypto(
    randomUUID?: () => string,
  ): () => void {
    const original = globalThis.crypto;
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value:
        randomUUID === undefined
          ? undefined
          : { ...original, randomUUID },
    });
    return () => {
      Object.defineProperty(globalThis, "crypto", {
        configurable: true,
        value: original,
      });
    };
  }

  it("sends no request, releases the guard, and sets truthful error when secure UUID is unavailable", async () => {
    const restore = withCrypto(undefined);
    try {
      const request = vi.fn();
      const controller = new IncidentController(
        { request } as unknown as EmployeeApiClient,
        () => undefined,
      );

      await controller.submit(input);

      expect(request).not.toHaveBeenCalled();
      expect(controller.getState().phase).toBe("idle");
      expect(controller.getState().error).toContain("Secure UUID");
      expect(controller.getState().report).toBeNull();

      // Retry remains possible once secure UUID returns.
      restore();
      request.mockResolvedValueOnce(okResponse);
      await controller.submit(input);
      expect(controller.getState().phase).toBe("reported");
    } finally {
      restore();
    }
  });
});
