import { describe, expect, it, vi } from "vitest";

import type { DashboardApiClient } from "../../../../../lib/api/dashboard-api-client";
import { readStudioSettings } from "./studio-settings-read";

const org = "11111111-1111-4111-8111-111111111111";
const location = "22222222-2222-4222-8222-222222222222";
const updatedAt = "2026-10-31T12:00:00.000Z";

const defaults = {
  checkInPhotosRequired: true,
  handoffStandardMethodPolicy: "EITHER",
  trackingEnabled: true,
  rawGpsRetentionDays: 30,
  valetServiceFee: "1.000",
  paymentServicePayer: "CUSTOMER",
  paymentMethodsPolicy: "CASH_OR_DIGITAL",
  tipsEnabled: true,
  validationEnabled: false,
  releaseRequiresPayment: false,
  languageDefault: "AR",
  operatingHours: null,
  ocrAssistEnabled: true,
  parkingSpotRequired: false,
  employeeRetrievalRequestedNotificationEnabled: true,
  guestVehicleReadyNotificationEnabled: false,
} as const;

function client(result: unknown) {
  const request = vi.fn().mockResolvedValue(result);
  return { api: { request } as unknown as DashboardApiClient, request };
}

describe("Policies Studio authoritative settings projection", () => {
  it("reads Company defaults from the established management route", async () => {
    const { api, request } = client({ organizationId: org, updatedAt, defaults });
    const snapshot = await readStudioSettings(api, { kind: "company", organizationId: org });
    expect(request.mock.calls[0]![0]).toBe("/v1/staff/management/organizations/" + org + "/settings");
    expect(snapshot.effective.tipsEnabled).toBe(true);
    expect(snapshot.availableKeys).toContain("operatingHours");
    expect(snapshot.availableKeys).not.toContain("slaTargetSeconds");
    expect(snapshot.locationId).toBeNull();
  });

  it("keeps an explicit false Location override separate from inheritance", async () => {
    const settings: Record<string, {
      default: unknown; override: unknown; overridePresent: boolean; effective: unknown;
    }> = Object.fromEntries(
      Object.entries(defaults).map(([key, value]) => [
        key, { default: value, override: null, overridePresent: false, effective: value },
      ]),
    );
    settings.tipsEnabled = {
      default: true, override: false, overridePresent: true, effective: false,
    };
    const { api } = client({
      organizationId: org, locationId: location, updatedAt,
      timezone: "Asia/Amman", currency: "JOD",
      settings: { ...settings, slaTargetSeconds: 300 },
    });
    const snapshot = await readStudioSettings(api, {
      kind: "management-location", organizationId: org, locationId: location,
    });
    expect(snapshot.defaults.tipsEnabled).toBe(true);
    expect(snapshot.overrides.tipsEnabled).toBe(false);
    expect(snapshot.overridePresent.tipsEnabled).toBe(true);
    expect(snapshot.effective.tipsEnabled).toBe(false);
    expect(snapshot.overridePresent.operatingHours).toBe(false);
    expect(snapshot.effective.slaTargetSeconds).toBe(300);
    expect(snapshot.defaults.slaTargetSeconds).toBeUndefined();
  });

  it("restricts Location Manager view to returned legacy settings", async () => {
    const { api } = client({
      organizationId: org, locationId: location, updatedAt,
      timezone: "Asia/Amman", currency: "JOD",
      settings: [{
        setting: "tipsEnabled", default: true,
        overridePresent: true, override: false, effective: false,
      }],
    });
    const snapshot = await readStudioSettings(api, { kind: "manager-location", locationId: location });
    expect(snapshot.availableKeys).toEqual(["tipsEnabled"]);
    expect(snapshot.overridePresent.tipsEnabled).toBe(true);
    expect(snapshot.effective.tipsEnabled).toBe(false);
    expect(snapshot.availableKeys).not.toContain("languageDefault");
  });

  it("rejects a read whose server scope disagrees with the selected scope", async () => {
    const { api } = client({ organizationId: location, updatedAt, defaults });
    await expect(readStudioSettings(api, { kind: "company", organizationId: org }))
      .rejects.toMatchObject({ kind: "malformed" });
  });
});
