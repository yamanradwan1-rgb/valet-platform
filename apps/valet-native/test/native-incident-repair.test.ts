import { afterEach, describe, expect, it, vi } from "vitest";
import { EmployeeApiError } from "@valet/employee-client";

import { presentNativeIncidentFailure } from "../src/incident/native-incident-copy";
import { NativeIncidentSession } from "../src/incident/native-incident-session";
import { NATIVE_INCIDENT_OPERATION_FAILED } from "../src/incident/native-incident-error";
import { detail, sessionId } from "./native-parity-11-test-fixture";

const firstId = "11111111-1111-4111-8111-111111111111";
const secondId = "22222222-2222-4222-8222-222222222222";
const input = {
  description: "Damage",
  severity: "HIGH" as const,
  type: "VEHICLE_DAMAGE" as const,
};

function report(incidentId: string) {
  return {
    createdAt: "2026-09-10T10:00:00.000Z",
    incidentId,
    reportedByMembershipId: "33333333-3333-4333-8333-333333333333",
    sessionId,
    severity: input.severity,
    status: "OPEN",
    type: input.type,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Incident secure identity and safe failure repair", () => {
  it("uses secure randomUUID, keeps it across retry, then mints a new report ID", async () => {
    const randomUUID = vi
      .fn()
      .mockReturnValueOnce(firstId)
      .mockReturnValueOnce(secondId);
    vi.stubGlobal("crypto", { randomUUID });
    let postCount = 0;
    const request = vi.fn(
      ({ body, method }: { body?: { incidentId: string }; method: string }) => {
        if (method === "GET") return Promise.resolve(detail());
        postCount += 1;
        if (postCount === 1) {
          return Promise.reject(
            new EmployeeApiError({
              code: "INCIDENT_TEMPORARILY_UNAVAILABLE",
              message: "Incident service is temporarily unavailable.",
              status: 503,
            }),
          );
        }
        return Promise.resolve(report(body!.incidentId));
      },
    );
    const session = new NativeIncidentSession(() => ({ request }) as never);

    await session.open({ origin: "PARKING", sessionId });
    expect(await session.submit(input)).toBe(false);
    expect(session.current()).toMatchObject({
      error: "Incident service is temporarily unavailable.",
      phase: "form",
      report: null,
    });
    expect(await session.submit(input)).toBe(true);
    expect(
      (request.mock.calls[1]![0] as { body: { incidentId: string } }).body
        .incidentId,
    ).toBe(firstId);
    expect(
      (request.mock.calls[2]![0] as { body: { incidentId: string } }).body
        .incidentId,
    ).toBe(firstId);
    expect(randomUUID).toHaveBeenCalledOnce();

    await session.open({ origin: "RETRIEVAL", sessionId });
    expect(await session.submit(input)).toBe(true);
    expect(
      (request.mock.calls[4]![0] as { body: { incidentId: string } }).body
        .incidentId,
    ).toBe(secondId);
    expect(randomUUID).toHaveBeenCalledTimes(2);
  });

  it("fails closed before POST when secure UUID generation is unavailable", async () => {
    vi.stubGlobal("crypto", {});
    const weakRandom = vi.spyOn(Math, "random");
    const request = vi.fn().mockResolvedValue(detail());
    const session = new NativeIncidentSession(() => ({ request }) as never);

    await session.open({ origin: "HANDOFF", sessionId });
    expect(await session.submit(input)).toBe(false);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith({
      method: "GET",
      path: `/v1/staff/valet-sessions/${sessionId}`,
    });
    expect(weakRandom).not.toHaveBeenCalled();
    expect(session.current()).toMatchObject({ phase: "form", report: null });
    expect(session.current().error).toBe(NATIVE_INCIDENT_OPERATION_FAILED);
    expect(presentNativeIncidentFailure("en", session.current().error!)).toBe(
      "The operation failed. Refresh and try again.",
    );
  });

  it("uses safe English API copy and canonical Arabic failure copy", () => {
    expect(
      presentNativeIncidentFailure("en", "Incident could not be opened."),
    ).toBe("Incident could not be opened.");
    expect(
      presentNativeIncidentFailure("ar", "Incident could not be opened."),
    ).toBe("تعذر تنفيذ العملية. حدّث الصفحة وحاول مجدداً.");
  });
});
