import type { StaffValetSessionDetailResponse } from "@valet/employee-client";
import { vi } from "vitest";
import { NativeGuestAccessSession } from "../src/guest-access/native-guest-access-session";

export const sessionId = "44444444-4444-4444-8444-444444444444";
export const tokenA = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef012345678-_";
export const tokenB = "ZYXWVUTSRQPONMLKJIHGFEDCBA9876543210zyxwvut";
export const target = { origin: "CHECK_IN" as const, sessionId };
export const validOrigin = {
  ok: true as const,
  origin: "https://customer.example.com",
};

export function detail(
  status: StaffValetSessionDetailResponse["guestAccess"]["status"],
  revokedAt: string | null = status === "REVOKED"
    ? "2026-09-10T10:00:00.123Z"
    : null,
): StaffValetSessionDetailResponse {
  return {
    checkIn: { conditionCompletedAt: null },
    guestAccess: {
      expiresAt: status === "NOT_ISSUED" ? null : "2026-09-11T10:00:00.000Z",
      revokedAt,
      status,
    },
    handoff: { pendingAt: null, verification: null },
    keySlot: null,
    locationId: "11111111-1111-4111-8111-111111111111",
    parking: {
      parkedAt: null,
      parkingSpotCode: null,
      parkingStartedAt: null,
      parkingZoneCode: null,
    },
    sessionId,
    state: "AWAITING_PARKING",
    vehicle: {
      color: null,
      make: null,
      model: null,
      plateCountry: null,
      plateNumberRaw: null,
      temporaryDescriptor: "Vehicle",
      vehicleId: "77777777-7777-4777-8777-777777777777",
      vehicleUpdatedAt: "2026-09-10T09:00:00.000Z",
    },
    version: 1,
  };
}

export function issuePayload(rawToken: string, mutationKind = "ISSUED") {
  return {
    expiresAt: "2026-09-11T10:00:00.000Z",
    issuedAt: "2026-09-10T10:00:00.000Z",
    mutationKind,
    rawToken,
    valetSessionId: sessionId,
  };
}

export function queueSession(
  responses: unknown[],
  options: { isOnline?: () => boolean } = {},
) {
  const requests: Array<{ body?: unknown; method: string; path: string }> = [];
  const request = vi.fn((input: (typeof requests)[number]) => {
    requests.push(input);
    const next = responses.shift();
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
  });
  const session = new NativeGuestAccessSession(() => ({ request }) as never, {
    customerOrigin: validOrigin,
    isOnline: options.isOnline ?? (() => true),
  });
  return { request, requests, session };
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((accept, decline) => {
    resolve = accept;
    reject = decline;
  });
  return { promise, reject, resolve };
}
