import type { StaffValetSessionDetailResponse } from "@valet/contracts";

import type { EmployeeApiClient } from "../../lib/api/employee-api-client";
import { GuestAccessController } from "./guest-access-controller";
import type { GuestAccessControllerOptions } from "./guest-access-controller";
import type { GuestAccessView } from "./guest-access-types";

export const sessionId = "11111111-1111-4111-8111-111111111111";
export const TOKEN_A = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef012345678-_";
export const TOKEN_B = "ZYXWVUTSRQPONMLKJIHGFEDCBA9876543210zyxwvut";

export function detail(
  guestAccess: StaffValetSessionDetailResponse["guestAccess"],
): StaffValetSessionDetailResponse {
  return {
    checkIn: { conditionCompletedAt: null },
    guestAccess,
    handoff: { pendingAt: null, verification: null },
    keySlot: null,
    locationId: "22222222-2222-4222-8222-222222222222",
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
      temporaryDescriptor: null,
      vehicleId: "33333333-3333-4333-8333-333333333333",
      vehicleUpdatedAt: "2026-08-21T18:00:00.000Z",
    },
    version: 1,
  };
}

export const notIssued = () =>
  detail({ expiresAt: null, revokedAt: null, status: "NOT_ISSUED" });

export const active = () =>
  detail({
    expiresAt: "2026-08-22T18:05:00.000Z",
    revokedAt: null,
    status: "ACTIVE",
  });

export const expired = () =>
  detail({
    expiresAt: "2026-08-20T18:05:00.000Z",
    revokedAt: null,
    status: "EXPIRED",
  });

export const revoked = (revokedAt: string) =>
  detail({ expiresAt: null, revokedAt, status: "REVOKED" });

export function issueBody(rawToken: string) {
  return {
    expiresAt: "2026-08-22T18:05:00.000Z",
    issuedAt: "2026-08-21T18:05:00.000Z",
    mutationKind: "ISSUED" as const,
    rawToken,
    valetSessionId: sessionId,
  };
}

export interface Harness {
  readonly controller: GuestAccessController;
  readonly requestBodies: unknown[];
  readonly requestPaths: string[];
}

/**
 * Queue-based fake EmployeeApiClient: each call consumes the next queued
 * item; rejected items must be Error instances.
 */
export function makeHarness(
  queue: Array<unknown>,
  options: GuestAccessControllerOptions = {},
): Harness {
  const requestPaths: string[] = [];
  const requestBodies: unknown[] = [];
  let call = -1;
  const client = {
    request: (path: string, requestOptions?: { body?: unknown }) => {
      call += 1;
      requestPaths.push(path);
      requestBodies.push(requestOptions?.body);
      const next = queue[call];
      return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
    },
  } as unknown as EmployeeApiClient;
  const controller = new GuestAccessController(() => undefined, {
    getOrigin:
      options.getOrigin ??
      (() => ({ ok: true as const, origin: "https://customer.example.com" })),
    isOnline: options.isOnline ?? (() => true),
  });
  controller.setApiClient(client);
  return { controller, requestBodies, requestPaths };
}

export type { GuestAccessView };
