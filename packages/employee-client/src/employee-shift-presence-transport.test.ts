import { expect, it, vi } from "vitest";
import type {
  EmployeeClient,
  EmployeeTransportRequest,
} from "./employee-client";
import { createEmployeeShiftPresenceTransport } from "./employee-shift-presence-transport";
import { presenceFixture } from "./employee-shift-presence-test-fixture";

it.each(["START", "END"] as const)(
  "%s OFF and WARN_ONLY missing requests preserve top-level O without raw evidence",
  async (action) => {
    const s = presenceFixture("OFF", action);
    const request = vi.fn(async () => s.result);
    const transport = createEmployeeShiftPresenceTransport(
      () => ({ request }) as unknown as EmployeeClient,
    );
    const id = "11111111-1111-4111-8111-111111111111";
    await transport.submit(s.target, id);
    expect(request).toHaveBeenCalledExactlyOnceWith({
      method: "POST",
      path:
        action === "START"
          ? "/v1/staff/shifts/start"
          : `/v1/staff/shifts/${s.target.shiftId}/end`,
      body:
        action === "START"
          ? { operationId: id, targetLocationId: s.target.locationId }
          : { operationId: id, cashReported: "1" },
    });
    const serialized = JSON.stringify(request.mock.calls);
    for (const field of [
      "measurement",
      "presence",
      "mocked",
      "latitude",
      "longitude",
      "membershipId",
      "organizationId",
    ])
      expect(serialized).not.toContain(field);
  },
);

it("MEASURED request preserves true/false/absent source and exact selector equality", async () => {
  const s = presenceFixture("WARN_ONLY");
  const sent: EmployeeTransportRequest[] = [];
  const transport = createEmployeeShiftPresenceTransport(
    () =>
      ({
        request: async (request: EmployeeTransportRequest) => {
          sent.push(request);
          return s.result;
        },
      }) as unknown as EmployeeClient,
  );
  const id = "11111111-1111-4111-8111-111111111111";
  for (const mocked of [true, false, undefined]) {
    const measurement = {
      latitude: 1,
      longitude: 2,
      accuracyMeters: 7,
      capturedAt: "2026-10-04T10:00:01Z",
      ...(mocked === undefined ? {} : { mocked }),
    };
    await transport.submit(s.target, id, {
      kind: "MEASURED",
      operationId: id,
      challengeId: id,
      clientSampleId: id,
      measurement,
    });
    expect(sent.at(-1)!.body).toEqual({
      targetLocationId: s.target.locationId,
      operationId: id,
      presence: {
        kind: "MEASURED",
        operationId: id,
        challengeId: id,
        clientSampleId: id,
        measurement,
      },
    });
  }
});

it("challenge, status and Exception requests carry no raw measurement", async () => {
  const s = presenceFixture("REQUIRE_OR_OVERRIDE");
  await s.session.run(s.target);
  const id = s.session.descriptor()!.operationId;
  const request = vi.fn(async (value: EmployeeTransportRequest) =>
    value.path.endsWith("/challenges") || value.path.endsWith("/challenge")
      ? s.challenge()
      : value.path.endsWith("/exception") || value.path.includes("/exceptions/")
        ? s.exception()
        : s.committed(),
  );
  const transport = createEmployeeShiftPresenceTransport(
    () => ({ request }) as unknown as EmployeeClient,
  );
  await transport.challenge({
    action: "START",
    targetLocationId: s.target.locationId,
    operationId: id,
  });
  await transport.readChallenge(id);
  await transport.recover(id);
  await transport.requestException(
    id,
    s.challenge().challengeId,
    "GPS_UNAVAILABLE",
  );
  await transport.readException(s.exception().exceptionId);
  for (const call of request.mock.calls) {
    expect(JSON.stringify(call)).not.toMatch(
      /latitude|longitude|mocked|measurement|accessToken/,
    );
    if (call[0].method === "GET") expect(call[0].body).toBeUndefined();
  }
});
