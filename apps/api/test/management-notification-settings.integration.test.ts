import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { ManagementControlPlaneTestFixture } from "./management-control-plane-test-fixture";

const fixture = new ManagementControlPlaneTestFixture();
const notificationSettings = [
  "employeeRetrievalRequestedNotificationEnabled",
  "guestVehicleReadyNotificationEnabled",
] as const;

type NotificationSetting = (typeof notificationSettings)[number];

beforeAll(() => fixture.start(), 120_000);
afterEach(() => fixture.resetLimits());
afterAll(() => fixture.stop(), 60_000);

function companyPath(organizationId: string) {
  return `/v1/staff/management/organizations/${organizationId}/settings`;
}

function locationPath(organizationId: string, locationId: string) {
  return `/v1/staff/management/organizations/${organizationId}/locations/${locationId}/settings`;
}

function expected(
  body: Record<string, unknown>,
  updatedAt: unknown,
): Record<string, unknown> {
  return { ...body, expectedUpdatedAt: String(updatedAt) };
}

async function assuredAdmin() {
  const user = await fixture.createUser();
  const membership = await fixture.createMembership(user.id);
  const location = await fixture.addLocation(membership.organizationId);
  const auth = await fixture.nativeLogin(user);
  await fixture.enrollAndAssure(auth);
  return { auth, location, membership, user };
}

async function auditCount(
  organizationId: string,
  setting: NotificationSetting,
  eventType: string,
  locationId: string | null,
) {
  const result = await fixture.query<{ count: string }>(
    `SELECT count(*)::text AS count
     FROM audit_events
     WHERE organization_id=$1
       AND event_type=$2
       AND metadata_json->>'settingKey'=$3
       AND location_id IS NOT DISTINCT FROM $4::uuid`,
    [organizationId, eventType, setting, locationId],
  );
  return result.rows[0]?.count;
}

describe("MGT-BE-05 Management notification settings API", () => {
  it.each(notificationSettings)(
    "changes Company %s on -> off -> on with optimistic concurrency",
    async (setting) => {
      const actor = await assuredAdmin();
      const path = companyPath(actor.membership.organizationId);
      const initial = await fixture.managementGet(path, actor.auth.accessToken);
      expect(initial.status).toBe(200);
      expect(initial.body?.defaults).toMatchObject({ [setting]: true });

      const disabled = await fixture.managementPut(
        `${path}/default`,
        actor.auth.accessToken,
        expected({ setting, value: false }, initial.body?.updatedAt),
      );
      expect(disabled.status).toBe(200);
      expect(disabled.body?.defaults).toMatchObject({ [setting]: false });

      const staleEnable = await fixture.managementPut(
        `${path}/default`,
        actor.auth.accessToken,
        expected({ setting, value: true }, initial.body?.updatedAt),
      );
      expect(staleEnable.status).toBe(409);
      expect(staleEnable.body).toMatchObject({
        code: "CONFIGURATION_CONFLICT",
      });

      const enabled = await fixture.managementPut(
        `${path}/default`,
        actor.auth.accessToken,
        expected({ setting, value: true }, disabled.body?.updatedAt),
      );
      expect(enabled.status).toBe(200);
      expect(enabled.body?.defaults).toMatchObject({ [setting]: true });
    },
  );

  it.each(notificationSettings)(
    "keeps Location %s false/true overrides distinct from inherit and CLEAR uses the current default",
    async (setting) => {
      const actor = await assuredAdmin();
      const company = companyPath(actor.membership.organizationId);
      const location = locationPath(
        actor.membership.organizationId,
        actor.location.locationId,
      );
      const initial = await fixture.managementGet(
        location,
        actor.auth.accessToken,
      );
      expect(initial.status).toBe(200);
      expect(initial.body?.settings).toMatchObject({
        [setting]: {
          default: true,
          effective: true,
          override: null,
          overridePresent: false,
        },
      });

      const explicitFalse = await fixture.managementPut(
        `${location}/override`,
        actor.auth.accessToken,
        expected({ setting, value: false }, initial.body?.updatedAt),
      );
      expect(explicitFalse.status).toBe(200);
      expect(explicitFalse.body?.settings).toMatchObject({
        [setting]: {
          default: true,
          effective: false,
          override: false,
          overridePresent: true,
        },
      });

      const companyState = await fixture.managementGet(
        company,
        actor.auth.accessToken,
      );
      const companyFalse = await fixture.managementPut(
        `${company}/default`,
        actor.auth.accessToken,
        expected({ setting, value: false }, companyState.body?.updatedAt),
      );
      expect(companyFalse.status).toBe(200);

      const stillExplicitFalse = await fixture.managementGet(
        location,
        actor.auth.accessToken,
      );
      expect(stillExplicitFalse.body?.settings).toMatchObject({
        [setting]: {
          default: false,
          effective: false,
          override: false,
          overridePresent: true,
        },
      });

      const explicitTrue = await fixture.managementPut(
        `${location}/override`,
        actor.auth.accessToken,
        expected({ setting, value: true }, stillExplicitFalse.body?.updatedAt),
      );
      expect(explicitTrue.status).toBe(200);
      expect(explicitTrue.body?.settings).toMatchObject({
        [setting]: {
          default: false,
          effective: true,
          override: true,
          overridePresent: true,
        },
      });

      const cleared = await fixture.managementPost(
        `${location}/override/clear`,
        actor.auth.accessToken,
        expected({ setting }, explicitTrue.body?.updatedAt),
      );
      expect(cleared.status).toBe(201);
      expect(cleared.body?.settings).toMatchObject({
        [setting]: {
          default: false,
          effective: false,
          override: null,
          overridePresent: false,
        },
      });
    },
  );

  it.each(notificationSettings)(
    "treats desired-state %s retries as no-op before CAS and writes no extra audit",
    async (setting) => {
      const actor = await assuredAdmin();
      const company = companyPath(actor.membership.organizationId);
      const initial = await fixture.managementGet(
        company,
        actor.auth.accessToken,
      );
      const changed = await fixture.managementPut(
        `${company}/default`,
        actor.auth.accessToken,
        expected({ setting, value: false }, initial.body?.updatedAt),
      );
      expect(changed.status).toBe(200);
      const beforeCompany = await auditCount(
        actor.membership.organizationId,
        setting,
        "MANAGEMENT_COMPANY_SETTING_DEFAULT_CHANGED",
        null,
      );

      const staleNoop = await fixture.managementPut(
        `${company}/default`,
        actor.auth.accessToken,
        expected({ setting, value: false }, initial.body?.updatedAt),
      );
      expect(staleNoop.status).toBe(200);
      expect(staleNoop.body?.updatedAt).toBe(changed.body?.updatedAt);
      expect(
        await auditCount(
          actor.membership.organizationId,
          setting,
          "MANAGEMENT_COMPANY_SETTING_DEFAULT_CHANGED",
          null,
        ),
      ).toBe(beforeCompany);
    },
  );

  it("rejects extra notification discriminators, future notification settings, and unknown settings strictly", async () => {
    const actor = await assuredAdmin();
    const path = companyPath(actor.membership.organizationId);
    const initial = await fixture.managementGet(path, actor.auth.accessToken);
    const invalid = [
      {
        notificationType: "EMPLOYEE_RETRIEVAL_REQUESTED",
        setting: "employeeRetrievalRequestedNotificationEnabled",
        value: false,
      },
      { setting: "futureNotificationEnabled", value: false },
      { setting: "unknownSetting", value: false },
    ];
    for (const body of invalid) {
      const response = await fixture.managementPut(
        `${path}/default`,
        actor.auth.accessToken,
        expected(body, initial.body?.updatedAt),
      );
      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ code: "REQUEST_INVALID" });
    }

    const current = await fixture.managementGet(path, actor.auth.accessToken);
    expect(current.body).toMatchObject({
      defaults: {
        employeeRetrievalRequestedNotificationEnabled: true,
        guestVehicleReadyNotificationEnabled: true,
      },
      updatedAt: initial.body?.updatedAt,
    });
  });

  it("conceals cross-tenant notification setting writes without audit", async () => {
    const actor = await assuredAdmin();
    const foreignOrganizationId = await fixture.createOrganization({
      name: "Foreign",
    });
    const foreignLocation = await fixture.addLocation(foreignOrganizationId);
    const foreignPath = locationPath(
      foreignOrganizationId,
      foreignLocation.locationId,
    );

    const write = await fixture.managementPut(
      `${foreignPath}/override`,
      actor.auth.accessToken,
      expected(
        { setting: "guestVehicleReadyNotificationEnabled", value: false },
        new Date().toISOString(),
      ),
    );
    expect(write.status).toBe(404);
    expect(write.body).toMatchObject({ code: "AUTHORIZATION_DENIED" });
    expect(
      await auditCount(
        foreignOrganizationId,
        "guestVehicleReadyNotificationEnabled",
        "MANAGEMENT_LOCATION_SETTING_OVERRIDE_CHANGED",
        foreignLocation.locationId,
      ),
    ).toBe("0");
  });
});
