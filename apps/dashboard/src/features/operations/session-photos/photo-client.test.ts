import { describe, expect, it, vi } from "vitest";
import type { DashboardApiClient } from "../../../lib/api/dashboard-api-client";
import { DashboardApiError } from "../../../lib/api/dashboard-api-error";
import { makeSessionPhotoTransport, photoErrorState, sessionPhotoManifestSchema } from "./photo-client";

const locationId = "99999999-9999-4999-8999-999999999991";
const sessionId = "99999999-9999-4999-8999-999999999992";
const photoId = "99999999-9999-4999-8999-999999999993";

describe("#309 protected photo adapter", () => {
  it("validates only eligible bounded JPEG manifest records", () => {
    expect(sessionPhotoManifestSchema.safeParse({ items: [] }).success).toBe(true);
    expect(sessionPhotoManifestSchema.safeParse({ items: [{ photoId, contentType: "image/jpeg" }] }).success).toBe(true);
    expect(sessionPhotoManifestSchema.safeParse({ items: [{ photoId, contentType: "image/png" }] }).success).toBe(false);
    expect(sessionPhotoManifestSchema.safeParse({ items: Array.from({ length: 11 }, () => ({ photoId, contentType: "image/jpeg" })) }).success).toBe(false);
    expect(sessionPhotoManifestSchema.safeParse({ items: [{ photoId: "../secret", contentType: "image/jpeg" }] }).success).toBe(false);
  });

  it("never sends a byte request without valid scoped IDs, and binds bytes to protected path", async () => {
    const request = vi.fn(async () => ({ items: [{ photoId, contentType: "image/jpeg" as const }] }));
    const requestBinary = vi.fn(async () => ({
      bytes: new Uint8Array([0xff, 0xd8, 0x11, 0xff, 0xd9]),
      contentType: "image/jpeg",
      filename: "",
    }));
    const api = { request, requestBinary } as unknown as DashboardApiClient;
    const client = makeSessionPhotoTransport(api);
    const controller = new AbortController();
    const list = await client.list(locationId, sessionId, controller.signal);
    expect(list).toHaveLength(1);
    expect(request).toHaveBeenCalledWith(
      "/v1/staff/dashboard/locations/" + locationId + "/sessions/" + sessionId + "/condition-photos",
      sessionPhotoManifestSchema,
      { method: "GET", signal: controller.signal },
    );
    const blob = await client.read(locationId, sessionId, photoId, controller.signal);
    expect(blob.type).toBe("image/jpeg");
    expect(blob.size).toBe(5);
    expect(requestBinary).toHaveBeenCalledWith(
      "/v1/staff/dashboard/locations/" + locationId + "/sessions/" + sessionId + "/condition-photos/" + photoId + "/bytes",
      { method: "GET", expectedContentType: "image/jpeg", signal: controller.signal },
    );
    await expect(client.read(locationId, sessionId, "../secret", controller.signal)).rejects.toThrow("identity");
    expect(requestBinary).toHaveBeenCalledTimes(1);
  });

  it("rejects disguised, truncated, oversized or malformed JPEGs without returning a Blob", async () => {
    const requestBinary = vi.fn().mockResolvedValue({
      bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
      contentType: "image/jpeg",
      filename: "",
    });
    const client = makeSessionPhotoTransport({ requestBinary } as unknown as DashboardApiClient);
    await expect(client.read(locationId, sessionId, photoId, new AbortController().signal)).rejects.toThrow("JPEG");
    requestBinary.mockResolvedValueOnce({
      bytes: new Uint8Array([0xff, 0xd8, 0x10, 0x10]),
      contentType: "image/jpeg",
      filename: "",
    });
    await expect(client.read(locationId, sessionId, photoId, new AbortController().signal)).rejects.toThrow("JPEG");
  });

  it("never distinguishes protected 401/403/404 or credential changes in UI state", () => {
    for (const status of [401, 403, 404]) {
      const error = new DashboardApiError({ kind: "authorization", message: "private", status });
      expect(photoErrorState(error)).toBe("denied");
    }
    expect(photoErrorState(new DashboardApiError({ kind: "auth", message: "identity changed" }))).toBe("denied");
    expect(photoErrorState(new DashboardApiError({ kind: "network", message: "offline" }))).toBe("error");
    expect(photoErrorState(new DashboardApiError({ kind: "unknown", message: "gone", status: 410 }))).toBe("unavailable");
  });
});
