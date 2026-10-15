import { describe, expect, it, vi } from "vitest";
import type { NativeAuthSession } from "@valet/employee-client";

const request = vi.hoisted(() => vi.fn());
vi.mock("../src/tasks/native-operational-http", () => ({
  createNativeEmployeeClient: () => ({ request }),
}));

const { createNativeConditionPhotoTransport } =
  await import("../src/check-in/native-condition-photo-transport");

const sessionId = "11111111-1111-4111-8111-111111111111";
const operationId = "22222222-2222-4222-8222-222222222222";
const verified = {
  valetSessionId: sessionId, operationId, status: "VERIFIED",
  vehiclePhotoId: "33333333-3333-4333-8333-333333333333",
  contentType: "image/jpeg", byteSize: 5,
  verifiedAt: "2026-10-15T10:00:00.000Z",
};

describe("Native actual photo transport", () => {
  it("passes actual JPEG bytes in multipart through existing authenticated client", async () => {
    const bytes = new Uint8Array([255, 216, 9, 255, 217]);
    const blob = new Blob([bytes], { type: "image/jpeg" });
    const file = vi.fn(() => blob);
    request.mockResolvedValueOnce(verified);
    const transport = createNativeConditionPhotoTransport(
      "https://example.invalid", {} as NativeAuthSession,
      { file } as never,
    );
    expect(await transport.upload(
      sessionId, operationId, "private-opaque-handle", new AbortController().signal,
    )).toEqual(verified);
    expect(file).toHaveBeenCalledExactlyOnceWith("private-opaque-handle");
    const sent = request.mock.calls[0]?.[0] as {
      readonly method: string;
      readonly path: string;
      readonly body: FormData;
    };
    expect(sent.method).toBe("POST");
    expect(sent.path).toMatch(/condition-photo-uploads$/);
    expect(sent.body).toBeInstanceOf(FormData);
    expect(sent.body.get("operationId")).toBe(operationId);
    const actual = sent.body.get("image") as Blob;
    expect(actual).toBeInstanceOf(Blob);
    expect(Array.from(new Uint8Array(await actual.arrayBuffer()))).toEqual(Array.from(bytes));
    expect(sent.body.getAll("image")).toHaveLength(1);
  });
});
