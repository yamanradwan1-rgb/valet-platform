import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { ManagementControlPlaneTestFixture } from "./management-control-plane-test-fixture";

const fixture = new ManagementControlPlaneTestFixture();

beforeAll(() => fixture.start(), 120_000);
afterEach(async () => {
  await fixture.resetLimits();
  await fixture.query("DROP TRIGGER IF EXISTS be05_audit_failure ON audit_events");
  await fixture.query("DROP FUNCTION IF EXISTS be05_fail_audit() CASCADE");
});
afterAll(() => fixture.stop(), 60_000);

function companyPath(organizationId: string) {
  return `/v1/staff/management/organizations/${organizationId}/settings`;
}

function locationPath(organizationId: string, locationId: string) {
  return `${companyPath(organizationId).replace(/\/settings$/, "")}/locations/${locationId}/settings`;
}

function setting(body: Record<string, unknown>, updatedAt: unknown) {
  return { ...body, expectedUpdatedAt: String(updatedAt) };
}

async function assuredAdmin() {
  const user = await fixture.createUser();
  const membership = await fixture.createMembership(user.id);
  const location = await fixture.addLocation(membership.organizationId);
  const auth = await fixture.nativeLogin(user);
  const factor = await fixture.enrollAndAssure(auth);
  return { auth, factor, location, membership, user };
}

describe("MGT-BE-05 Company settings Management", () => {
  it("reads bounded defaults and mutates language with CAS, Arabic round-trip, audit, and no-op convergence", async () => {
    const context = await assuredAdmin();
    const path = companyPath(context.membership.organizationId);
    const initial = await fixture.managementGet(path, context.auth.accessToken);
    expect(initial.status).toBe(200);
    expect(initial.body?.defaults).toMatchObject({
      languageDefault: "EN",
      ocrAssistEnabled: true,
      operatingHours: null,
      parkingSpotRequired: true,
      employeeRetrievalRequestedNotificationEnabled: true,
      guestVehicleReadyNotificationEnabled: true,
    });

    const changed = await fixture.managementPut(
      `${path}/default`,
      context.auth.accessToken,
      setting({ setting: "languageDefault", value: "AR" }, initial.body?.updatedAt),
    );
    expect(changed.status).toBe(200);
    expect(changed.body?.defaults).toMatchObject({ languageDefault: "AR" });
    expect(changed.body?.updatedAt).not.toBe(initial.body?.updatedAt);

    const audit = await fixture.query<{
      actor_membership_id: string;
      location_id: string | null;
      metadata_json: Record<string, unknown>;
    }>(
      `SELECT actor_membership_id::text, location_id::text, metadata_json
       FROM audit_events
       WHERE organization_id=$1 AND event_type='MANAGEMENT_COMPANY_SETTING_DEFAULT_CHANGED'
       ORDER BY occurred_at DESC LIMIT 1`,
      [context.membership.organizationId],
    );
    expect(audit.rows[0]).toMatchObject({
      actor_membership_id: context.membership.membershipId,
      location_id: null,
      metadata_json: {
        newValue: "AR",
        previousValue: "EN",
        scope: "COMPANY_DEFAULT",
        settingKey: "languageDefault",
      },
    });

    const beforeNoop = await fixture.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM audit_events
       WHERE organization_id=$1 AND event_type='MANAGEMENT_COMPANY_SETTING_DEFAULT_CHANGED'`,
      [context.membership.organizationId],
    );
    const noop = await fixture.managementPut(
      `${path}/default`,
      context.auth.accessToken,
      setting({ setting: "languageDefault", value: "AR" }, initial.body?.updatedAt),
    );
    expect(noop.status).toBe(200);
    expect(noop.body?.updatedAt).toBe(changed.body?.updatedAt);
    const afterNoop = await fixture.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM audit_events
       WHERE organization_id=$1 AND event_type='MANAGEMENT_COMPANY_SETTING_DEFAULT_CHANGED'`,
      [context.membership.organizationId],
    );
    expect(afterNoop.rows[0]?.count).toBe(beforeNoop.rows[0]?.count);
  });

  it("keeps STANDARD reads available while stale sensitive MFA requires soft step-up", async () => {
    const context = await assuredAdmin();
    const path = companyPath(context.membership.organizationId);
    await fixture.query(
      `UPDATE staff_auth_sessions
       SET created_at=clock_timestamp()-interval '2 hours',
           mfa_authenticated_at=clock_timestamp()-interval '6 minutes',
           last_admin_activity_at=clock_timestamp()-interval '1 minute'
       WHERE id=$1`,
      [context.auth.sessionId],
    );
    const read = await fixture.managementGet(path, context.auth.accessToken);
    expect(read.status).toBe(200);
    const write = await fixture.managementPut(
      `${path}/default`,
      context.auth.accessToken,
      setting({ setting: "ocrAssistEnabled", value: false }, read.body?.updatedAt),
    );
    expect(write.status).toBe(403);
    expect(write.body).toMatchObject({ code: "MFA_STEP_UP_REQUIRED" });
    const persisted = await fixture.query<{ enabled: boolean }>(
      `SELECT ocr_assist_enabled AS enabled FROM organizations WHERE id=$1`,
      [context.membership.organizationId],
    );
    expect(persisted.rows[0]?.enabled).toBe(true);
  });

  it("manages exact-Location overrides with false distinct from inherit and CLEAR uses the current default", async () => {
    const context = await assuredAdmin();
    const path = locationPath(
      context.membership.organizationId,
      context.location.locationId,
    );
    const initial = await fixture.managementGet(path, context.auth.accessToken);
    expect(initial.status).toBe(200);
    expect(initial.body?.settings).toMatchObject({
      parkingSpotRequired: {
        default: true,
        effective: true,
        override: null,
        overridePresent: false,
      },
    });
    const override = await fixture.managementPut(
      `${path}/override`,
      context.auth.accessToken,
      setting({ setting: "parkingSpotRequired", value: false }, initial.body?.updatedAt),
    );
    expect(override.status).toBe(200);
    expect(override.body?.settings).toMatchObject({
      parkingSpotRequired: {
        default: true,
        effective: false,
        override: false,
        overridePresent: true,
      },
    });

    const company = await fixture.managementGet(
      companyPath(context.membership.organizationId),
      context.auth.accessToken,
    );
    const defaultChanged = await fixture.managementPut(
      `${companyPath(context.membership.organizationId)}/default`,
      context.auth.accessToken,
      setting({ setting: "parkingSpotRequired", value: false }, company.body?.updatedAt),
    );
    expect(defaultChanged.status).toBe(200);
    const cleared = await fixture.managementPost(
      `${path}/override/clear`,
      context.auth.accessToken,
      setting({ setting: "parkingSpotRequired" }, override.body?.updatedAt),
    );
    expect(cleared.status).toBe(201);
    expect(cleared.body?.settings).toMatchObject({
      parkingSpotRequired: {
        default: false,
        effective: false,
        override: null,
        overridePresent: false,
      },
    });
  });

  it("persists one normalized local-wall-clock week without UTC/DST conversion and rejects malformed schedules", async () => {
    const context = await assuredAdmin();
    await fixture.query(`UPDATE locations SET timezone='America/New_York' WHERE id=$1`, [
      context.location.locationId,
    ]);
    const path = companyPath(context.membership.organizationId);
    const initial = await fixture.managementGet(path, context.auth.accessToken);
    const days = [
      "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY",
    ].map((weekday, index) =>
      index === 6
        ? { status: "CLOSED", weekday }
        : { closesAt: "18:00", opensAt: "09:00", status: "OPEN", weekday });
    const setHours = await fixture.managementPut(
      `${path}/default`,
      context.auth.accessToken,
      setting({ setting: "operatingHours", value: { days } }, initial.body?.updatedAt),
    );
    expect(setHours.status).toBe(200);
    const location = await fixture.managementGet(
      locationPath(context.membership.organizationId, context.location.locationId),
      context.auth.accessToken,
    );
    expect(location.status).toBe(200);
    expect(location.body?.timezone).toBe("America/New_York");
    expect(location.body?.settings).toMatchObject({
      operatingHours: { default: { days }, effective: { days }, overridePresent: false },
    });

    const malformed = await fixture.managementPut(
      `${path}/default`,
      context.auth.accessToken,
      setting({
        setting: "operatingHours",
        value: { days: days.map((day, index) => index === 0 ? { ...day, closesAt: "08:00" } : day) },
      }, setHours.body?.updatedAt),
    );
    expect(malformed.status).toBe(400);
    expect(malformed.body).toMatchObject({ code: "REQUEST_INVALID" });
  });

  it("isolates Organizations and roles on both Company and Location Management settings", async () => {
    const admin = await assuredAdmin();
    const second = await fixture.createMembership(admin.user.id, { name: "Second admin" });
    const secondLocation = await fixture.addLocation(second.organizationId);
    const foreign = await fixture.managementGet(
      locationPath(admin.membership.organizationId, secondLocation.locationId),
      admin.auth.accessToken,
    );
    expect(foreign.status).toBe(404);
    expect(foreign.body).toMatchObject({ code: "AUTHORIZATION_DENIED" });
    const own = await fixture.managementGet(
      locationPath(second.organizationId, secondLocation.locationId),
      admin.auth.accessToken,
    );
    expect(own.status).toBe(200);

    const managerUser = await fixture.createUser();
    const manager = await fixture.createMembership(managerUser.id, { role: "LOCATION_MANAGER" });
    const managerAuth = await fixture.nativeLogin(managerUser);
    const denied = await fixture.managementGet(
      companyPath(manager.organizationId),
      managerAuth.accessToken,
    );
    expect(denied.status).toBe(404);
    expect(denied.body).toMatchObject({ code: "AUTHORIZATION_DENIED" });
  });

  it("rolls back a Company mutation when the required audit insert fails", async () => {
    const context = await assuredAdmin();
    const path = companyPath(context.membership.organizationId);
    const initial = await fixture.managementGet(path, context.auth.accessToken);
    await fixture.query(
      `CREATE FUNCTION be05_fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$
       BEGIN
         IF NEW.event_type='MANAGEMENT_COMPANY_SETTING_DEFAULT_CHANGED' THEN
           RAISE EXCEPTION 'BE05 audit failure';
         END IF;
         RETURN NEW;
       END $$`,
    );
    await fixture.query(
      `CREATE TRIGGER be05_audit_failure BEFORE INSERT ON audit_events
       FOR EACH ROW EXECUTE FUNCTION be05_fail_audit()`,
    );
    const failed = await fixture.managementPut(
      `${path}/default`,
      context.auth.accessToken,
      setting({ setting: "ocrAssistEnabled", value: false }, initial.body?.updatedAt),
    );
    expect(failed.status).toBe(500);
    const persisted = await fixture.query<{ enabled: boolean }>(
      `SELECT ocr_assist_enabled AS enabled FROM organizations WHERE id=$1`,
      [context.membership.organizationId],
    );
    expect(persisted.rows[0]?.enabled).toBe(true);
  });
});
