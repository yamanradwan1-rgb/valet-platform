import type {
  ClearConfigurationOverrideRequest,
  ConfigurationMutationResponse,
  ConfigurationSettingProjection,
  LocationConfigurationResponse,
  SetConfigurationOverrideRequest,
} from "@valet/contracts";

import { DashboardApiError } from "../../lib/api/api-error";
import {
  createConfigurationController,
  type ConfigurationSnapshot,
} from "./configuration-controller";

/**
 * Focused shared setup for the configuration controller suites (D4-003).
 * Contains no assertions — only deterministic request/response plumbing.
 */

export const LOCATION_A = "11111111-1111-4111-8111-111111111111";
export const LOCATION_B = "22222222-2222-4222-8222-222222222222";
export const T1 = "2026-08-01T10:00:00.000Z";
export const T2 = "2026-08-01T11:00:00.000Z";

export interface PendingLoad {
  readonly locationId: string;
  reject(error: unknown): void;
  resolve(data: LocationConfigurationResponse): void;
}

export interface PendingMutation {
  readonly locationId: string;
  readonly request:
    | SetConfigurationOverrideRequest
    | ClearConfigurationOverrideRequest;
  reject(error: unknown): void;
  resolve(response: ConfigurationMutationResponse): void;
}

export function allAbsentProjections(): ConfigurationSettingProjection[] {
  return [
    { default: false, effective: false, override: null, overridePresent: false, setting: "checkInPhotosRequired" },
    { default: "PICKUP_CODE", effective: "PICKUP_CODE", override: null, overridePresent: false, setting: "handoffStandardMethodPolicy" },
    { default: false, effective: false, override: null, overridePresent: false, setting: "trackingEnabled" },
    { default: 30, effective: 30, override: null, overridePresent: false, setting: "rawGpsRetentionDays" },
    { default: "0.000", effective: "0.000", override: null, overridePresent: false, setting: "valetServiceFee" },
    { default: "CUSTOMER", effective: "CUSTOMER", override: null, overridePresent: false, setting: "paymentServicePayer" },
    { default: "CASH_OR_DIGITAL", effective: "CASH_OR_DIGITAL", override: null, overridePresent: false, setting: "paymentMethodsPolicy" },
    { default: true, effective: true, override: null, overridePresent: false, setting: "tipsEnabled" },
    { default: false, effective: false, override: null, overridePresent: false, setting: "validationEnabled" },
    { default: true, effective: true, override: null, overridePresent: false, setting: "releaseRequiresPayment" },
  ];
}

export function configuration(
  locationId: string,
  token: string,
): LocationConfigurationResponse {
  return {
    currency: "JOD",
    locationId,
    organizationId: "99999999-8888-4777-8666-555555555555",
    settings: allAbsentProjections(),
    timezone: "Asia/Amman",
    updatedAt: token,
  };
}

export function mutationResponse(
  token: string,
  setting: "tipsEnabled" | "valetServiceFee" = "tipsEnabled",
  locationId: string = LOCATION_A,
): ConfigurationMutationResponse {
  const result: ConfigurationSettingProjection =
    setting === "valetServiceFee"
      ? { default: "0.000", effective: "9.900", override: "9.900", overridePresent: true, setting: "valetServiceFee" }
      : { default: true, effective: false, override: false, overridePresent: true, setting: "tipsEnabled" };
  return { locationId, result, updatedAt: token };
}

export function conflictError(): DashboardApiError {
  return new DashboardApiError({
    code: "CONFIGURATION_OVERRIDE_CONFLICT",
    kind: "conflict",
    message: "Location configuration changed concurrently.",
    status: 409,
  });
}

/** Lets queued microtasks (promise callbacks) settle. */
export function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export class Harness {
  readonly snapshots: ConfigurationSnapshot[] = [];
  readonly loads: PendingLoad[] = [];
  readonly sets: PendingMutation[] = [];
  readonly clears: PendingMutation[] = [];
  readonly controller = createConfigurationController({
    clearOverride: ({ locationId, request }) =>
      new Promise<ConfigurationMutationResponse>((resolve, reject) => {
        this.clears.push({ locationId, reject, request, resolve });
      }),
    fetcher: ({ locationId }) =>
      new Promise<LocationConfigurationResponse>((resolve, reject) => {
        this.loads.push({ locationId, reject, resolve });
      }),
    onChange: (snapshot) => {
      this.snapshots.push(snapshot);
    },
    setOverride: ({ locationId, request }) =>
      new Promise<ConfigurationMutationResponse>((resolve, reject) => {
        this.sets.push({ locationId, reject, request, resolve });
      }),
  });

  get latest(): ConfigurationSnapshot {
    return this.snapshots[this.snapshots.length - 1]!;
  }

  async loadAndSettle(locationId: string, token: string): Promise<void> {
    this.controller.load(locationId);
    this.loads[this.loads.length - 1]!.resolve(configuration(locationId, token));
    await flush();
  }
}
