import type { DashboardApiClient } from "../../../lib/api/dashboard-api-client";
import { DashboardApiError } from "../../../lib/api/dashboard-api-error";

export interface SessionPhotoRecord {
  readonly photoId: string;
  readonly contentType: "image/jpeg";
  readonly verifiedAt?: string;
}
export interface SessionPhotoManifest {
  readonly items: readonly SessionPhotoRecord[];
}

export interface SessionPhotoTransport {
  list(locationId: string, sessionId: string, signal: AbortSignal): Promise<readonly SessionPhotoRecord[]>;
  read(locationId: string, sessionId: string, photoId: string, signal: AbortSignal): Promise<Blob>;
}

const maxJpegBytes = 8 * 1024 * 1024;
const exactId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const sessionPhotoManifestSchema = {
  safeParse(value: unknown):
    | { readonly success: true; readonly data: SessionPhotoManifest }
    | { readonly success: false; readonly error: string } {
    if (!isRecord(value) || !Array.isArray(value.items) || value.items.length > 10) {
      return { success: false, error: "Invalid protected photo manifest." };
    }
    const items: SessionPhotoRecord[] = [];
    for (const candidate of value.items as unknown[]) {
      if (!isRecord(candidate) || typeof candidate.photoId !== "string" ||
        !exactId.test(candidate.photoId) || candidate.contentType !== "image/jpeg" ||
        (candidate.verifiedAt !== undefined &&
          (typeof candidate.verifiedAt !== "string" ||
          !Number.isFinite(Date.parse(candidate.verifiedAt))))) {
        return { success: false, error: "Invalid protected photo item." };
      }
      items.push({
        photoId: candidate.photoId,
        contentType: "image/jpeg",
        ...(candidate.verifiedAt === undefined ? {} : { verifiedAt: candidate.verifiedAt as string }),
      });
    }
    return { success: true, data: { items } };
  },
};

function path(locationId: string, sessionId: string, photoId?: string): string {
  if (![locationId, sessionId, photoId].filter((value) => value !== undefined).every((value) => exactId.test(value!))) {
    throw new Error("Invalid scoped photo identity.");
  }
  const base = "/v1/staff/dashboard/locations/" + encodeURIComponent(locationId) +
    "/sessions/" + encodeURIComponent(sessionId) + "/condition-photos";
  return photoId === undefined ? base : base + "/" + encodeURIComponent(photoId) + "/bytes";
}

function malformedPhoto(): never {
  throw new Error("Invalid protected JPEG response.");
}

export function makeSessionPhotoTransport(api: DashboardApiClient): SessionPhotoTransport {
  return {
    async list(locationId, sessionId, signal) {
      const value = await api.request(path(locationId, sessionId), sessionPhotoManifestSchema, {
        method: "GET",
        signal,
      });
      if (new Set(value.items.map((item) => item.photoId)).size !== value.items.length) malformedPhoto();
      return value.items;
    },
    async read(locationId, sessionId, photoId, signal) {
      const response = await api.requestBinary(path(locationId, sessionId, photoId), {
        method: "GET",
        expectedContentType: "image/jpeg",
        signal,
      });
      const bytes = response.bytes;
      if (
        response.contentType !== "image/jpeg" ||
        bytes.byteLength < 4 ||
        bytes.byteLength > maxJpegBytes ||
        bytes[0] !== 0xff || bytes[1] !== 0xd8 ||
        bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9
      ) malformedPhoto();
      return new Blob([new Uint8Array(bytes)], { type: "image/jpeg" });
    },
  };
}

export function photoErrorState(error: unknown): "denied" | "unavailable" | "error" {
  if (error instanceof DashboardApiError) {
    if (
      error.status === 401 || error.status === 403 || error.status === 404 ||
      error.kind === "auth" || error.kind === "authorization" ||
      error.kind === "entitlement" || error.kind === "mfa"
    ) return "denied";
    if (error.status === 410) return "unavailable";
  }
  return "error";
}
