import { describe, expect, it, vi } from "vitest";
import { EmployeeClient } from "./employee-client";
import { createEmployeeConditionPhotoTransport } from "./employee-condition-photo-transport";

const sessionId = "11111111-1111-4111-8111-111111111111";
const operationId = "22222222-2222-4222-8222-222222222222";
const verified = {
  valetSessionId: sessionId, operationId, status: "VERIFIED",
  vehiclePhotoId: "33333333-3333-4333-8333-333333333333",
  contentType: "image/jpeg", byteSize: 1234,
  verifiedAt: "2026-10-15T10:00:00.000Z",
};

describe("portable photo wire contract", () => {
  it("submits an opaque body once and validates the exact server response", async () => {
    const execute = vi.fn().mockResolvedValue({ status: 201, payload: verified });
    const multipart = vi.fn().mockReturnValue({ actual: "bytes-owned-by-native" });
    const transport = createEmployeeConditionPhotoTransport(
      () => new EmployeeClient({ transport: { execute } }), multipart,
    );
    const outcome = await transport.upload(sessionId, operationId, "handle-1", new AbortController().signal);
    expect(outcome).toEqual(verified);
    expect(multipart).toHaveBeenCalledExactlyOnceWith(operationId, "handle-1");
    expect(execute).toHaveBeenCalledWith({
      body: { actual: "bytes-owned-by-native" }, method: "POST",
      path: `/v1/staff/check-in/sessions/${sessionId}/condition-photo-uploads`,
    });
  });

  it.each([
    { ...verified, valetSessionId: "44444444-4444-4444-8444-444444444444" },
    { ...verified, operationId: "55555555-5555-4555-8555-555555555555" },
    { ...verified, byteSize: 0 },
    { ...verified, objectKey: "private-invalid" },
    { ...verified, verifiedAt: "not-a-date" },
  ])("rejects malformed, foreign or over-trusting VERIFIED body", async (payload) => {
    const transport = createEmployeeConditionPhotoTransport(
      () => new EmployeeClient({ transport: { execute: async () => ({ status: 200, payload }) } }),
      () => ({}),
    );
    await expect(transport.status(sessionId, operationId, new AbortController().signal))
      .rejects.toThrow();
  });

  it("status/discovery are read-only and reconcile requires an explicit method call", async () => {
    const execute = vi.fn().mockResolvedValue({
      status: 200, payload: { valetSessionId: sessionId,
        photoPolicy: { required: false, source: "ORGANIZATION_DEFAULT" },
        qualifyingPhotoPresent: false, pendingOperation: null, latestOperation: null },
    });
    const transport = createEmployeeConditionPhotoTransport(
      () => new EmployeeClient({ transport: { execute } }), () => ({}),
    );
    await transport.discover(sessionId, new AbortController().signal);
    expect(execute).toHaveBeenCalledWith({
      method: "GET", path: `/v1/staff/check-in/sessions/${sessionId}/condition-photo-state`,
    });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("reads a strict actor-authorized newest-four metadata window without image URLs", async () => {
    const response = { valetSessionId: sessionId, verifiedTotal: 6,
      latestVerified: [{ operationId, vehiclePhotoId: verified.vehiclePhotoId,
        verifiedAt: verified.verifiedAt, status: "VERIFIED" }] };
    const execute = vi.fn().mockResolvedValue({ status: 200, payload: response });
    const transport = createEmployeeConditionPhotoTransport(
      () => new EmployeeClient({ transport: { execute } }), () => ({}),
    );
    expect(await transport.summary?.(sessionId, new AbortController().signal))
      .toEqual(response);
    expect(execute).toHaveBeenCalledWith({ method: "GET",
      path: `/v1/staff/check-in/sessions/${sessionId}/condition-photo-evidence-summary` });
    execute.mockResolvedValue({ status: 200, payload: {
      ...response, latestVerified: [{ ...response.latestVerified[0], objectKey: "private" }],
    } });
    await expect(transport.summary?.(sessionId, new AbortController().signal))
      .rejects.toThrow();
  });
});
