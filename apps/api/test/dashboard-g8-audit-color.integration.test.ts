import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import { DashboardApiTestContext } from "./dashboard-api-test-context";

class DashboardAuditColorTestContext extends DashboardApiTestContext {}

const context = new DashboardAuditColorTestContext("audit-color");

beforeAll(() => context.setupApi(), 120_000);
beforeEach(() => context.clearAntiAbuse());
afterAll(() => context.teardownApi(), 60_000);

describe("VAL-009F primary-color audit semantics", () => {
  it(
    "writes exactly two distinct audit rows with correct fields",
    async () => {
      const fixture = await context.managerFixture();
      const staff = await context.createStaff(fixture);
      const login = await context.login(staff);
      expect(login.status).toBe(200);
      const authorization = `Bearer ${String(login.body?.accessToken)}`;
      const base = `/v1/staff/dashboard/locations/${fixture.locationId}`;

      const initial = await context.request("GET", `${base}/branding`, {
        authorization,
      });
      expect(initial.status).toBe(200);

      const setResult = await context.request("PUT", `${base}/branding/override`, {
        authorization,
        body: {
          expectedUpdatedAt: initial.body?.updatedAt,
          setting: "brandPrimaryColor",
          value: "#123ABC",
        },
      });
      expect(setResult.status).toBe(200);

      const clearResult = await context.request(
        "POST",
        `${base}/branding/override/clear`,
        {
          authorization,
          body: {
            expectedUpdatedAt: setResult.body?.updatedAt,
            setting: "brandPrimaryColor",
          },
        },
      );
      expect(clearResult.status).toBe(201);

      const rows = await context.adminPool.query<{
        actor_membership_id: string;
        entity_id: string;
        entity_type: string;
        metadata_json: Record<string, unknown>;
        organization_id: string;
        valet_session_id: string | null;
      }>(
        `SELECT id,
                organization_id,
                location_id,
                actor_membership_id,
                valet_session_id,
                entity_type,
                entity_id,
                metadata_json
         FROM audit_events
         WHERE event_type = 'DASHBOARD_LOCATION_BRANDING_OVERRIDE_CHANGED'
           AND location_id = $1
           AND metadata_json ->> 'settingKey' = 'brandPrimaryColor'
         ORDER BY occurred_at`,
        [fixture.locationId],
      );
      expect(rows.rows).toHaveLength(2);

      const [setRow, clearRow] = rows.rows;

      for (const row of rows.rows) {
        expect(row.organization_id).toBe(fixture.organizationId);
        expect(row.entity_type).toBe("Location");
        expect(row.entity_id).toBe(fixture.locationId);
        expect(row.valet_session_id).toBeNull();
        expect(row.actor_membership_id).toBe(staff.membershipId);
      }

      expect(setRow!.metadata_json).toMatchObject({
        newEffectiveValue: "#123ABC",
        newOverridePresent: true,
        newOverrideValue: "#123ABC",
        oldEffectiveValue: "#176BFF",
        oldOverridePresent: false,
        operation: "SET",
        scope: "LOCATION_BRANDING_OVERRIDE",
        settingKey: "brandPrimaryColor",
      });

      expect(clearRow!.metadata_json).toMatchObject({
        newEffectiveValue: "#176BFF",
        newOverridePresent: false,
        oldEffectiveValue: "#123ABC",
        oldOverridePresent: true,
        operation: "CLEAR",
        scope: "LOCATION_BRANDING_OVERRIDE",
        settingKey: "brandPrimaryColor",
      });
    },
    60_000,
  );
});
