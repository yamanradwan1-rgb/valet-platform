import type {
  BrandingClearRequest,
  BrandingReadResponse,
  BrandingSetRequest,
} from "@valet/contracts";

import { DashboardApiError } from "../../lib/api/api-error";
import {
  createBrandingController,
  type BrandingSnapshot,
} from "./branding-controller";

/**
 * Focused shared setup for the branding controller suites (D4-004).
 * Contains no assertions — only deterministic request/response plumbing.
 *
 * NOTE: branding mutations resolve with a FULL BrandingReadResponse (the
 * backend returns the whole read envelope for set AND clear), so the harness
 * resolves pending mutations with `readResponse(...)`.
 */

export const LOCATION_A = "11111111-1111-4111-8111-111111111111";
export const LOCATION_B = "22222222-2222-4222-8222-222222222222";
export const T1 = "2026-08-01T10:00:00.000Z";
export const T2 = "2026-08-01T11:00:00.000Z";

export interface PendingLoad {
  readonly locationId: string;
  /** The AbortSignal handed to the fetcher (aborted on supersede/dispose). */
  readonly signal: AbortSignal;
  reject(error: unknown): void;
  resolve(data: BrandingReadResponse): void;
}

export interface PendingMutation {
  readonly locationId: string;
  readonly request: BrandingSetRequest | BrandingClearRequest;
  reject(error: unknown): void;
  resolve(response: BrandingReadResponse): void;
}

/** Full authoritative read envelope with deliberately INCONSISTENT-looking
 * projections (effective ≠ override??default would be the client recompute —
 * here effective carries its own backend value) to pin that the UI consumes
 * backend truth verbatim. */
export function readResponse(
  locationId: string,
  token: string,
  overrides?: {
    displayName?: Partial<BrandingReadResponse["displayName"]>;
    primaryColor?: Partial<BrandingReadResponse["primaryColor"]>;
  },
): BrandingReadResponse {
  return {
    displayName: {
      default: "Downtown Valet",
      effective: overrides?.displayName?.effective ?? "Downtown Valet",
      override: overrides?.displayName?.override ?? null,
      overridePresent: overrides?.displayName?.overridePresent ?? false,
    },
    locationId,
    primaryColor: {
      default: "#176BFF",
      effective: overrides?.primaryColor?.effective ?? "#176BFF",
      override: overrides?.primaryColor?.override ?? null,
      overridePresent: overrides?.primaryColor?.overridePresent ?? false,
    },
    updatedAt: token,
  };
}

export function conflictError(): DashboardApiError {
  return new DashboardApiError({
    code: "CONFIGURATION_OVERRIDE_CONFLICT",
    kind: "conflict",
    message: "Location configuration changed concurrently.",
    status: 409,
  });
}

export function valueInvalidError(): DashboardApiError {
  return new DashboardApiError({
    code: "CONFIGURATION_VALUE_INVALID",
    kind: "validation",
    message: "Invalid location configuration value.",
    status: 400,
  });
}

export function networkError(): DashboardApiError {
  return new DashboardApiError({
    code: "NETWORK_ERROR",
    isNetworkError: true,
    kind: "server",
    message: "Network connection unavailable.",
    status: 0,
  });
}

/** Lets queued microtasks (promise callbacks) settle. */
export function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export class Harness {
  readonly snapshots: BrandingSnapshot[] = [];
  readonly loads: PendingLoad[] = [];
  readonly sets: PendingMutation[] = [];
  readonly clears: PendingMutation[] = [];
  readonly controller = createBrandingController({
    clearOverride: ({ locationId, request }) =>
      new Promise<BrandingReadResponse>((resolve, reject) => {
        this.clears.push({ locationId, reject, request, resolve });
      }),
    fetcher: ({ locationId, signal }) =>
      new Promise<BrandingReadResponse>((resolve, reject) => {
        this.loads.push({ locationId, reject, resolve, signal });
      }),
    onChange: (snapshot) => {
      this.snapshots.push(snapshot);
    },
    setOverride: ({ locationId, request }) =>
      new Promise<BrandingReadResponse>((resolve, reject) => {
        this.sets.push({ locationId, reject, request, resolve });
      }),
  });

  get latest(): BrandingSnapshot {
    return this.snapshots[this.snapshots.length - 1]!;
  }

  async loadAndSettle(locationId: string, token: string): Promise<void> {
    this.controller.load(locationId);
    this.loads[this.loads.length - 1]!.resolve(readResponse(locationId, token));
    await flush();
  }
}
