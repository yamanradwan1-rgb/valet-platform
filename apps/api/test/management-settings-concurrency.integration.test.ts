import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import type { AuthHttpResult } from "./staff-auth-native-fixture";
import { ManagementControlPlaneTestFixture } from "./management-control-plane-test-fixture";

const fixture = new ManagementControlPlaneTestFixture();

beforeAll(() => fixture.start(), 120_000);
afterEach(() => fixture.resetLimits());
afterAll(() => fixture.stop(), 60_000);

function companySettingsPath(organizationId: string) {
  return `/v1/staff/management/organizations/${organizationId}/settings`;
}

function companyBrandingPath(organizationId: string) {
  return `/v1/staff/management/organizations/${organizationId}/branding`;
}

function locationSettingsPath(organizationId: string, locationId: string) {
  return `/v1/staff/management/organizations/${organizationId}/locations/${locationId}/settings`;
}

function expected(body: Record<string, unknown>, updatedAt: unknown) {
  return { ...body, expectedUpdatedAt: String(updatedAt) };
}

async function actors() {
  const firstUser = await fixture.createUser();
  const membership = await fixture.createMembership(firstUser.id, {
    name: "Concurrency company",
  });
  const location = await fixture.addLocation(membership.organizationId);
  const secondUser = await fixture.createUser();
  await fixture.addMembership(
    membership.organizationId,
    secondUser.id,
    "ORG_ADMIN",
  );
  const firstAuth = await fixture.nativeLogin(firstUser);
  const secondAuth = await fixture.nativeLogin(secondUser);
  await fixture.enrollAndAssure(firstAuth);
  await fixture.enrollAndAssure(secondAuth);
  return { firstAuth, location, membership, secondAuth };
}

async function waitForQueuedSettingsLocks(count: number): Promise<void> {
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const result = await fixture.query<{ n: number }>(
      `SELECT count(DISTINCT activity.pid)::int AS n
       FROM pg_stat_activity AS activity
       INNER JOIN pg_locks AS lock ON lock.pid=activity.pid
       WHERE activity.datname=current_database()
         AND activity.state='active'
         AND activity.wait_event_type='Lock'
         AND activity.query ILIKE '%pg_advisory_xact_lock(%'
         AND lock.locktype='advisory'
         AND lock.mode='ExclusiveLock'
         AND NOT lock.granted`,
    );
    if ((result.rows[0]?.n ?? 0) >= count) return;
  }
  throw new Error(`Expected ${count} queued Management settings writers.`);
}

async function queuedRace(
  organizationId: string,
  first: () => Promise<AuthHttpResult>,
  second: () => Promise<AuthHttpResult>,
): Promise<[AuthHttpResult, AuthHttpResult]> {
  const blocker = await fixture.databasePool().connect();
  let released = false;
  let firstRequest: Promise<AuthHttpResult> | undefined;
  let secondRequest: Promise<AuthHttpResult> | undefined;
  try {
    await blocker.query("BEGIN");
    await blocker.query(
      `SELECT pg_advisory_xact_lock(
         hashtextextended('management-settings-org:' || $1::text, 0)
       )`,
      [organizationId],
    );
    firstRequest = first();
    void firstRequest.catch(() => undefined);
    await waitForQueuedSettingsLocks(1);
    secondRequest = second();
    void secondRequest.catch(() => undefined);
    await waitForQueuedSettingsLocks(2);
    await blocker.query("COMMIT");
    released = true;
    return await Promise.all([firstRequest, secondRequest]);
  } finally {
    if (!released) await blocker.query("ROLLBACK").catch(() => undefined);
    blocker.release();
    await firstRequest?.catch(() => undefined);
    await secondRequest?.catch(() => undefined);
  }
}

describe("MGT-BE-05 Management settings concurrency", () => {
  it("gives one real winner when settings and branding share a stale Company token", async () => {
    const context = await actors();
    const organizationId = context.membership.organizationId;
    const settingsPath = companySettingsPath(organizationId);
    const brandingPath = companyBrandingPath(organizationId);
    const initial = await fixture.managementGet(
      settingsPath,
      context.firstAuth.accessToken,
    );
    const results = await queuedRace(
      organizationId,
      () => fixture.managementPut(
        `${settingsPath}/default`,
        context.firstAuth.accessToken,
        expected({ setting: "ocrAssistEnabled", value: false }, initial.body?.updatedAt),
      ),
      () => fixture.managementPut(
        `${brandingPath}/default`,
        context.secondAuth.accessToken,
        expected({ setting: "brandPrimaryColor", value: "#010203" }, initial.body?.updatedAt),
      ),
    );
    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
    expect(results.find((result) => result.status === 409)?.body).toMatchObject({
      code: "CONFIGURATION_CONFLICT",
    });
    const state = await fixture.query<{
      brand_primary_color: string;
      ocr_assist_enabled: boolean;
    }>(
      `SELECT brand_primary_color,ocr_assist_enabled
       FROM organizations WHERE id=$1`,
      [organizationId],
    );
    const row = state.rows[0]!;
    expect(Number(row.brand_primary_color === "#010203") + Number(!row.ocr_assist_enabled)).toBe(1);
    const audits = await fixture.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM audit_events
       WHERE organization_id=$1 AND event_type IN (
         'MANAGEMENT_COMPANY_SETTING_DEFAULT_CHANGED',
         'MANAGEMENT_COMPANY_BRANDING_DEFAULT_CHANGED'
       )`,
      [organizationId],
    );
    expect(audits.rows[0]?.n).toBe(1);
  });

  it("serializes Company default change with exact-Location SET and preserves the explicit override", async () => {
    const context = await actors();
    const organizationId = context.membership.organizationId;
    const companyPath = companySettingsPath(organizationId);
    const locationPath = locationSettingsPath(
      organizationId,
      context.location.locationId,
    );
    const company = await fixture.managementGet(companyPath, context.firstAuth.accessToken);
    const location = await fixture.managementGet(locationPath, context.secondAuth.accessToken);
    const results = await queuedRace(
      organizationId,
      () => fixture.managementPut(
        `${companyPath}/default`, context.firstAuth.accessToken,
        expected({ setting: "parkingSpotRequired", value: false }, company.body?.updatedAt),
      ),
      () => fixture.managementPut(
        `${locationPath}/override`, context.secondAuth.accessToken,
        expected({ setting: "parkingSpotRequired", value: true }, location.body?.updatedAt),
      ),
    );
    expect(results.map((result) => result.status)).toEqual([200, 200]);
    const final = await fixture.managementGet(locationPath, context.firstAuth.accessToken);
    expect(final.body?.settings).toMatchObject({
      parkingSpotRequired: {
        default: false,
        effective: true,
        override: true,
        overridePresent: true,
      },
    });
    const audits = await fixture.query<{
      event_type: string;
      metadata_json: Record<string, unknown>;
      occurred_at: Date;
    }>(
      `SELECT event_type,metadata_json,occurred_at FROM audit_events
       WHERE organization_id=$1 AND event_type IN (
         'MANAGEMENT_COMPANY_SETTING_DEFAULT_CHANGED',
         'MANAGEMENT_LOCATION_SETTING_OVERRIDE_CHANGED'
       ) ORDER BY occurred_at,id`,
      [organizationId],
    );
    expect(audits.rows).toHaveLength(2);
    const companyAudit = audits.rows.find((row) => row.event_type.includes("COMPANY"))!;
    const locationAudit = audits.rows.find((row) => row.event_type.includes("LOCATION"))!;
    expect(companyAudit.metadata_json).toMatchObject({
      newValue: "false", previousValue: "true", scope: "COMPANY_DEFAULT",
      settingKey: "parkingSpotRequired",
    });
    expect(locationAudit.metadata_json).toMatchObject({
      newEffectiveValue: "true", newOverridePresent: true, newOverrideValue: "true",
      oldOverridePresent: false, operation: "SET", scope: "LOCATION_OVERRIDE",
      settingKey: "parkingSpotRequired",
    });
    expect(locationAudit.metadata_json.oldEffectiveValue).toBe(
      companyAudit.occurred_at < locationAudit.occurred_at ? "false" : "true",
    );
  });

  it.each(["company-first", "clear-first"] as const)(
    "keeps CLEAR inherited from the committed Company default when queued %s",
    async (order) => {
      const context = await actors();
      const organizationId = context.membership.organizationId;
      const companyPath = companySettingsPath(organizationId);
      const locationPath = locationSettingsPath(organizationId, context.location.locationId);
      const initialLocation = await fixture.managementGet(locationPath, context.secondAuth.accessToken);
      const seeded = await fixture.managementPut(
        `${locationPath}/override`, context.secondAuth.accessToken,
        expected({ setting: "parkingSpotRequired", value: true }, initialLocation.body?.updatedAt),
      );
      expect(seeded.status).toBe(200);
      const company = await fixture.managementGet(companyPath, context.firstAuth.accessToken);
      const companyWrite = () => fixture.managementPut(
        `${companyPath}/default`, context.firstAuth.accessToken,
        expected({ setting: "parkingSpotRequired", value: false }, company.body?.updatedAt),
      );
      const clearWrite = () => fixture.managementPost(
        `${locationPath}/override/clear`, context.secondAuth.accessToken,
        expected({ setting: "parkingSpotRequired" }, seeded.body?.updatedAt),
      );
      const results = await queuedRace(
        organizationId,
        order === "company-first" ? companyWrite : clearWrite,
        order === "company-first" ? clearWrite : companyWrite,
      );
      const companyResult = results[order === "company-first" ? 0 : 1];
      const clearResult = results[order === "company-first" ? 1 : 0];
      expect(companyResult.status).toBe(200);
      expect(clearResult.status).toBe(201);
      const final = await fixture.managementGet(locationPath, context.firstAuth.accessToken);
      expect(final.body?.settings).toMatchObject({
        parkingSpotRequired: {
          default: false, effective: false, override: null, overridePresent: false,
        },
      });
      const persisted = await fixture.query<{ override_value: boolean | null }>(
        `SELECT parking_spot_required_override AS override_value FROM locations WHERE id=$1`,
        [context.location.locationId],
      );
      expect(persisted.rows[0]?.override_value).toBeNull();
      const audits = await fixture.query<{
        event_type: string; metadata_json: Record<string, unknown>; occurred_at: Date;
      }>(
        `SELECT event_type,metadata_json,occurred_at FROM audit_events
         WHERE organization_id=$1
           AND (event_type='MANAGEMENT_COMPANY_SETTING_DEFAULT_CHANGED'
             OR (event_type='MANAGEMENT_LOCATION_SETTING_OVERRIDE_CHANGED'
               AND metadata_json->>'operation'='CLEAR'))
         ORDER BY occurred_at,id`,
        [organizationId],
      );
      expect(audits.rows).toHaveLength(2);
      const companyAudit = audits.rows.find((row) => row.event_type.includes("COMPANY"))!;
      const clearAudit = audits.rows.find((row) => row.event_type.includes("LOCATION"))!;
      const companyBeforeClear = companyAudit.occurred_at < clearAudit.occurred_at;
      expect(companyBeforeClear).toBe(order === "company-first");
      expect(companyAudit.metadata_json).toMatchObject({
        newValue: "false", previousValue: "true", scope: "COMPANY_DEFAULT",
      });
      expect(clearAudit.metadata_json).toMatchObject({
        newEffectiveValue: companyBeforeClear ? "false" : "true",
        newOverridePresent: false, oldEffectiveValue: "true",
        oldOverridePresent: true, oldOverrideValue: "true",
        operation: "CLEAR", scope: "LOCATION_OVERRIDE",
        settingKey: "parkingSpotRequired",
      });
      expect(clearAudit.metadata_json).not.toHaveProperty("newOverrideValue");
    },
  );
});
