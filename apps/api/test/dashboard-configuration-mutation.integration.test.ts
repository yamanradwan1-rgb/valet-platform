import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { resolveEffectiveFinancialPolicy } from "../src/modules/payments/financial-policy-resolver";
import { DashboardConfigurationService } from "../src/modules/dashboard/dashboard-configuration-command";
import { DashboardTestContext } from "./dashboard-test-context";

const context = new DashboardTestContext("config-mutation");

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 120_000);

async function service(): Promise<DashboardConfigurationService> {
  return new DashboardConfigurationService(context.runtimePool);
}

async function auditCount(
  fixture: { organizationId: string; locationId: string },
): Promise<number> {
  const result = await context.adminPool.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM audit_events
     WHERE entity_type = 'Location' AND organization_id = $1
       AND location_id = $2 AND event_type LIKE 'LOCATION_CONFIGURATION_%'`,
    [fixture.organizationId, fixture.locationId],
  );
  return Number(result.rows[0]?.count ?? 0);
}

describe("VAL-009B override mutations", () => {
  it("sets five representative settings each with exactly one audit and one column change", async () => {
    const fixture = await context.createFixture({ role: "LOCATION_MANAGER" });
    const instance = await service();
    let token = (
      await instance.read({
        authenticatedUserId: fixture.userId,
        locationId: fixture.locationId,
      })
    ).updatedAt;
    const before = (
      await context.adminPool.query(`SELECT * FROM locations WHERE id = $1`, [
        fixture.locationId,
      ])
    ).rows[0]!;
    const mutations = [
      { setting: "checkInPhotosRequired", value: true },
      { setting: "handoffStandardMethodPolicy", value: "EITHER" },
      { setting: "rawGpsRetentionDays", value: 60 },
      { setting: "tipsEnabled", value: false },
      { setting: "valetServiceFee", value: "2.500" },
    ] as const;
    const touchedColumns = [
      "check_in_photos_required_override",
      "handoff_standard_method_policy_override",
      "raw_gps_retention_days_override",
      "tips_enabled_override",
      "valet_service_fee_override",
    ];
    for (const mutation of mutations) {
      const auditsBefore = await auditCount(fixture);
      const result = await instance.setOverride({
        authenticatedUserId: fixture.userId,
        locationId: fixture.locationId,
        ...mutation,
        expectedUpdatedAt: token,
      });
      expect(result.result.overridePresent).toBe(true);
      expect(new Date(result.updatedAt) > new Date(token)).toBe(true);
      token = result.updatedAt;
      expect(await auditCount(fixture)).toBe(auditsBefore + 1);
    }
    const row = (
      await context.adminPool.query(`SELECT * FROM locations WHERE id = $1`, [
        fixture.locationId,
      ])
    ).rows[0]!;
    expect(row.tips_enabled_override).toBe(false);
    expect(row.raw_gps_retention_days_override).toBe(60);
    expect(row.valet_service_fee_override).toBe("2.500");
    expect(row.handoff_standard_method_policy_override).toBe("EITHER");
    expect(row.check_in_photos_required_override).toBe(true);
    for (const column of Object.keys(row)) {
      if (!column.endsWith("_override") || column === "updated_at") continue;
      if (touchedColumns.includes(column)) continue;
      expect([column, row[column]]).toEqual([column, before[column]]);
    }
  });

  it("clears only the targeted override and resumes inheritance atomically", async () => {
    const fixture = await context.createFixture({ role: "LOCATION_MANAGER" });
    const instance = await service();
    const first = await instance.setOverride({
      authenticatedUserId: fixture.userId,
      locationId: fixture.locationId,
      setting: "validationEnabled",
      value: true,
      expectedUpdatedAt: (
        await instance.read({
          authenticatedUserId: fixture.userId,
          locationId: fixture.locationId,
        })
      ).updatedAt,
    });
    const auditsBefore = await auditCount(fixture);
    const cleared = await instance.clearOverride({
      authenticatedUserId: fixture.userId,
      locationId: fixture.locationId,
      setting: "validationEnabled",
      expectedUpdatedAt: first.updatedAt,
    });
    expect(cleared.result).toEqual({
      default: false,
      effective: false,
      override: null,
      overridePresent: false,
      setting: "validationEnabled",
    });
    expect(await auditCount(fixture)).toBe(auditsBefore + 1);
    const row = (
      await context.adminPool.query(
        `SELECT validation_enabled_override FROM locations WHERE id = $1`,
        [fixture.locationId],
      )
    ).rows[0]!;
    expect(row.validation_enabled_override).toBeNull();
  });

  it("rejects stale tokens with no mutation and no audit, then accepts a fresh token", async () => {
    const fixture = await context.createFixture({ role: "LOCATION_MANAGER" });
    const instance = await service();
    const before = await instance.read({
      authenticatedUserId: fixture.userId,
      locationId: fixture.locationId,
    });
    const auditsBefore = await auditCount(fixture);
    await expect(
      instance.setOverride({
        authenticatedUserId: fixture.userId,
        locationId: fixture.locationId,
        setting: "tipsEnabled",
        value: true,
        expectedUpdatedAt: "2020-01-01T00:00:00.000Z",
      }),
    ).rejects.toMatchObject({ code: "CONFIGURATION_OVERRIDE_CONFLICT" });
    expect(await auditCount(fixture)).toBe(auditsBefore);
    const after = await instance.read({
      authenticatedUserId: fixture.userId,
      locationId: fixture.locationId,
    });
    expect(after.updatedAt).toBe(before.updatedAt);
    expect(after.settings).toEqual(before.settings);
    const fresh = await instance.setOverride({
      authenticatedUserId: fixture.userId,
      locationId: fixture.locationId,
      setting: "tipsEnabled",
      value: true,
      expectedUpdatedAt: after.updatedAt,
    });
    expect(new Date(fresh.updatedAt) > new Date(after.updatedAt)).toBe(true);
  });

  it("rejects invalid retention, negative fees, unrepresentable money and bad enums with no mutation or audit", async () => {
    const usd = await context.createFixture({ role: "LOCATION_MANAGER" });
    await context.adminPool.query(
      `UPDATE locations SET currency = 'USD',
              updated_at = transaction_timestamp() WHERE id = $1`,
      [usd.locationId],
    );
    const instance = await service();
    const token = (
      await instance.read({
        authenticatedUserId: usd.userId,
        locationId: usd.locationId,
      })
    ).updatedAt;
    const auditsBefore = await auditCount(usd);
    await expect(
      instance.setOverride({
        authenticatedUserId: usd.userId,
        locationId: usd.locationId,
        setting: "rawGpsRetentionDays",
        value: -5,
        expectedUpdatedAt: token,
      }),
    ).rejects.toMatchObject({ code: "CONFIGURATION_VALUE_INVALID" });
    await expect(
      instance.setOverride({
        authenticatedUserId: usd.userId,
        locationId: usd.locationId,
        setting: "valetServiceFee",
        value: "-1.000",
        expectedUpdatedAt: token,
      }),
    ).rejects.toMatchObject({ code: "CONFIGURATION_VALUE_INVALID" });
    await expect(
      instance.setOverride({
        authenticatedUserId: usd.userId,
        locationId: usd.locationId,
        setting: "valetServiceFee",
        value: "0.0005",
        expectedUpdatedAt: token,
      }),
    ).rejects.toMatchObject({ code: "CONFIGURATION_VALUE_INVALID" });
    await expect(
      instance.setOverride({
        authenticatedUserId: usd.userId,
        locationId: usd.locationId,
        setting: "handoffStandardMethodPolicy",
        value: "SUPERVISOR_OVERRIDE" as never,
        expectedUpdatedAt: token,
      }),
    ).rejects.toMatchObject({ code: "CONFIGURATION_VALUE_INVALID" });
    await expect(
      instance.clearOverride({
        authenticatedUserId: usd.userId,
        locationId: usd.locationId,
        setting: "operatingHours" as never,
        expectedUpdatedAt: token,
      }),
    ).rejects.toMatchObject({ code: "CONFIGURATION_VALUE_INVALID" });
    expect(await auditCount(usd)).toBe(auditsBefore);
    const representable = await instance.setOverride({
      authenticatedUserId: usd.userId,
      locationId: usd.locationId,
      setting: "valetServiceFee",
      value: "5.25",
      expectedUpdatedAt: token,
    });
    expect(representable.result.effective).toBe("5.250");
  });

  it("propagates persisted overrides into policy resolution without restart", async () => {
    const fixture = await context.createFixture({ role: "LOCATION_MANAGER" });
    const scope = {
      locationId: fixture.locationId,
      organizationId: fixture.organizationId,
    };
    const client = await context.runtimePool.connect();
    try {
      expect(
        (await resolveEffectiveFinancialPolicy(client, scope)).policy
          .paymentMethodsPolicy,
      ).toBe("CASH_ONLY");
    } finally {
      client.release();
    }
    const instance = await service();
    await instance.setOverride({
      authenticatedUserId: fixture.userId,
      locationId: fixture.locationId,
      setting: "paymentMethodsPolicy",
      value: "CASH_OR_DIGITAL",
      expectedUpdatedAt: (
        await instance.read({
          authenticatedUserId: fixture.userId,
          locationId: fixture.locationId,
        })
      ).updatedAt,
    });
    const client2 = await context.runtimePool.connect();
    try {
      expect(
        (await resolveEffectiveFinancialPolicy(client2, scope)).policy
          .paymentMethodsPolicy,
      ).toBe("CASH_OR_DIGITAL");
    } finally {
      client2.release();
    }
  });
});
