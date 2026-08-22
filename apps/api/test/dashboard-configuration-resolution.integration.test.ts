import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DashboardConfigurationService } from "../src/modules/dashboard/dashboard-configuration-command";
import { DashboardTestContext } from "./dashboard-test-context";

const context = new DashboardTestContext("config-resolution");

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 120_000);

const SETTING_DEFAULTS = [
  ["checkInPhotosRequired", true],
  ["handoffStandardMethodPolicy", "PICKUP_CODE"],
  ["trackingEnabled", false],
  ["rawGpsRetentionDays", 45],
  ["valetServiceFee", "3.750"],
  ["paymentServicePayer", "VENUE"],
  ["paymentMethodsPolicy", "CASH_OR_DIGITAL"],
  ["tipsEnabled", true],
  ["validationEnabled", true],
  ["releaseRequiresPayment", true],
] as const;

async function service(): Promise<DashboardConfigurationService> {
  return new DashboardConfigurationService(context.runtimePool);
}

describe("VAL-009B typed location configuration resolution", () => {
  it("resolves default/overridePresent/override/effective for all ten settings", async () => {
    const fixture = await context.createFixture({ role: "LOCATION_MANAGER" });
    await context.adminPool.query(
      `UPDATE organizations SET check_in_photos_required = true,
              handoff_standard_method_policy = 'PICKUP_CODE',
              tracking_enabled = false, raw_gps_retention_days = 45,
              valet_service_fee = 3.750, payment_service_payer = 'VENUE',
              payment_methods_policy = 'CASH_OR_DIGITAL',
              tips_enabled = true, validation_enabled = true,
              release_requires_payment = true,
              updated_at = transaction_timestamp() WHERE id = $1`,
      [fixture.organizationId],
    );
    const response = await (await service()).read({
      authenticatedUserId: fixture.userId,
      locationId: fixture.locationId,
    });
    expect(response.organizationId).toBe(fixture.organizationId);
    expect(response.locationId).toBe(fixture.locationId);
    expect(response.timezone).toBe("Asia/Amman");
    expect(response.currency).toBe("JOD");
    expect(response.settings).toHaveLength(10);
    for (const [setting, expected] of SETTING_DEFAULTS) {
      const entry = response.settings.find(
        (candidate) => candidate.setting === setting,
      );
      expect(entry, setting).toMatchObject({
        default: expected,
        effective: expected,
        override: null,
        overridePresent: false,
        setting,
      });
    }
    expect(Date.parse(response.updatedAt)).not.toBeNaN();
  });

  it("keeps explicit false distinct from absent override and inherits null", async () => {
    const fixture = await context.createFixture({ role: "LOCATION_MANAGER" });
    await context.adminPool.query(
      `UPDATE organizations SET tracking_enabled = true,
              updated_at = transaction_timestamp() WHERE id = $1`,
      [fixture.organizationId],
    );
    const instance = await service();
    const token = (
      await instance.read({
        authenticatedUserId: fixture.userId,
        locationId: fixture.locationId,
      })
    ).updatedAt;
    const result = await instance.setOverride({
      authenticatedUserId: fixture.userId,
      locationId: fixture.locationId,
      setting: "trackingEnabled",
      value: false,
      expectedUpdatedAt: token,
    });
    expect(result.result).toEqual({
      default: true,
      effective: false,
      override: false,
      overridePresent: true,
      setting: "trackingEnabled",
    });
    await context.adminPool.query(
      `UPDATE locations SET tracking_enabled_override = NULL,
              updated_at = transaction_timestamp() WHERE id = $1`,
      [fixture.locationId],
    );
    const inherited = (
      await instance.read({
        authenticatedUserId: fixture.userId,
        locationId: fixture.locationId,
      })
    ).settings.find((entry) => entry.setting === "trackingEnabled");
    expect(inherited).toMatchObject({
      effective: true,
      overridePresent: false,
    });
  });

  it("exposes authoritative read-only Location timezone and currency", async () => {
    const fixture = await context.createFixture({ role: "LOCATION_MANAGER" });
    await context.adminPool.query(
      `UPDATE locations SET timezone = 'Asia/Riyadh', currency = 'SAR',
              updated_at = transaction_timestamp() WHERE id = $1`,
      [fixture.locationId],
    );
    const response = await (await service()).read({
      authenticatedUserId: fixture.userId,
      locationId: fixture.locationId,
    });
    expect(response.timezone).toBe("Asia/Riyadh");
    expect(response.currency).toBe("SAR");
    expect(
      response.settings.some(
        (entry) =>
          entry.setting === ("timezone" as unknown) ||
          entry.setting === ("currency" as unknown),
      ),
    ).toBe(false);
  });
});

describe("VAL-009B configuration authorization matrix", () => {
  it("authorizes an exact-location manager without any Shift and denies every failure class identically", async () => {
    const fixture = await context.createFixture({ role: "LOCATION_MANAGER" });
    const otherTenant = await context.createFixture({
      role: "LOCATION_MANAGER",
    });
    const ungranted = await context.addLocation(fixture, { access: false });
    const inactive = await context.addLocation(fixture, {
      status: "INACTIVE",
    });
    const admin = await context.createActor(fixture, "ORG_ADMIN");
    const supervisor = await context.createActor(fixture, "VALET_SUPERVISOR");
    const employee = await context.createActor(fixture, "VALET_EMPLOYEE");
    const instance = await service();
    const deniedReads = [
      ungranted,
      otherTenant.locationId,
      inactive,
      randomUUID(),
    ].map((locationId) => async () =>
      instance.read({ authenticatedUserId: fixture.userId, locationId }),
    );
    deniedReads.push(async () =>
      instance.read({
        authenticatedUserId: randomUUID(),
        locationId: fixture.locationId,
      }),
    );
    deniedReads.push(async () =>
      instance.read({
        authenticatedUserId: admin.userId,
        locationId: fixture.locationId,
      }),
    );
    for (const attempt of deniedReads) {
      await expect(attempt()).rejects.toMatchObject({
        code: "AUTHORIZATION_DENIED",
      });
    }
    await expect(
      instance.setOverride({
        authenticatedUserId: supervisor.userId,
        locationId: fixture.locationId,
        setting: "tipsEnabled",
        value: true,
        expectedUpdatedAt: "2026-01-01T00:00:00.000Z",
      }),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    await expect(
      instance.clearOverride({
        authenticatedUserId: employee.userId,
        locationId: fixture.locationId,
        setting: "tipsEnabled",
        expectedUpdatedAt: "2026-01-01T00:00:00.000Z",
      }),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
  });

  it("denies a shifted supervisor for generic configuration scope", async () => {
    const fixture = await context.createFixture({ role: "LOCATION_MANAGER" });
    const managerToken = await (await service()).read({
      authenticatedUserId: fixture.userId,
      locationId: fixture.locationId,
    });
    const supervisor = await context.createActor(fixture, "VALET_SUPERVISOR");
    await context.startActiveShift(fixture, supervisor);
    await expect(
      (await service()).setOverride({
        authenticatedUserId: supervisor.userId,
        locationId: fixture.locationId,
        setting: "checkInPhotosRequired",
        value: true,
        expectedUpdatedAt: managerToken.updatedAt,
      }),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
  });
});
