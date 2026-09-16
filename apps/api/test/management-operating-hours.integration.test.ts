import {
  managementLocationSettingsResponseSchema,
  operatingHoursValueSchema,
} from "@valet/contracts";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { ManagementControlPlaneTestFixture } from "./management-control-plane-test-fixture";
import { companyWeek, locationWeek } from "./management-operating-hours-test-values";
import { StartParkingTestContext } from "./start-parking-test-context";

const management = new ManagementControlPlaneTestFixture();
const parking = new StartParkingTestContext("operating_hours");

beforeAll(async () => {
  await management.start();
  await parking.setup();
}, 180_000);

afterEach(() => management.resetLimits());

afterAll(async () => {
  await parking.teardown();
  await management.stop();
}, 90_000);

function companyPath(organizationId: string) {
  return `/v1/staff/management/organizations/${organizationId}/settings`;
}

function locationPath(organizationId: string, locationId: string) {
  return `/v1/staff/management/organizations/${organizationId}/locations/${locationId}/settings`;
}

function setting(value: unknown, updatedAt: unknown) {
  return {
    expectedUpdatedAt: String(updatedAt),
    setting: "operatingHours",
    value,
  };
}

async function assuredAdmin() {
  const user = await management.createUser();
  const membership = await management.createMembership(user.id);
  const location = await management.addLocation(membership.organizationId);
  const auth = await management.nativeLogin(user);
  await management.enrollAndAssure(auth);
  return { auth, location, membership };
}

function replaceDay(index: number, replacement: Record<string, unknown>) {
  return {
    days: companyWeek.days.map((day, dayIndex) =>
      dayIndex === index ? replacement : day,
    ),
  };
}

async function storedCompanyHours(organizationId: string) {
  const result = await management.query<{
    closes_at: string | null;
    closes_type: string;
    is_closed: boolean;
    opens_at: string | null;
    opens_type: string;
    weekday: string;
  }>(
    `SELECT weekday::text, is_closed, opens_at::text, closes_at::text,
            pg_typeof(opens_at)::text AS opens_type,
            pg_typeof(closes_at)::text AS closes_type
     FROM organization_operating_hours
     WHERE organization_id=$1
     ORDER BY array_position(
       ARRAY['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY']::operating_weekday[],
       weekday
     )`,
    [organizationId],
  );
  return result.rows;
}

describe("MGT-BE-05 operating-hours contract and semantics", () => {
  it("accepts exactly one ordered seven-day local-wall-clock week including CLOSED", () => {
    expect(operatingHoursValueSchema.parse(companyWeek)).toEqual(companyWeek);
  });

  it.each([
    ["duplicate day", replaceDay(1, companyWeek.days[0]!)],
    ["missing day", { days: companyWeek.days.slice(0, -1) }],
    ["extra day", { days: [...companyWeek.days, companyWeek.days[6]] }],
    [
      "malformed local time",
      replaceDay(0, {
        ...companyWeek.days[0],
        opensAt: "9:15",
      }),
    ],
    [
      "equal open and close",
      replaceDay(0, {
        ...companyWeek.days[0],
        closesAt: "09:15",
      }),
    ],
    [
      "open after close",
      replaceDay(0, {
        ...companyWeek.days[0],
        opensAt: "18:00",
        closesAt: "17:00",
      }),
    ],
  ])("rejects %s", (_label, value) => {
    expect(operatingHoursValueSchema.safeParse(value).success).toBe(false);
  });

  it("rejects an invalid week at the HTTP contract boundary without mutation", async () => {
    const context = await assuredAdmin();
    const path = companyPath(context.membership.organizationId);
    const initial = await management.managementGet(
      path,
      context.auth.accessToken,
    );
    const duplicate = replaceDay(1, companyWeek.days[0]!);

    const rejected = await management.managementPut(
      `${path}/default`,
      context.auth.accessToken,
      setting(duplicate, initial.body?.updatedAt),
    );
    expect(rejected.status).toBe(400);
    expect(rejected.body).toMatchObject({ code: "REQUEST_INVALID" });

    const after = await management.managementGet(
      path,
      context.auth.accessToken,
    );
    expect(after.body?.defaults).toMatchObject({ operatingHours: null });
  });

  it("inherits Company hours, applies Location override, and CLEAR restores inheritance", async () => {
    const context = await assuredAdmin();
    await management.query(
      `UPDATE locations SET timezone='America/New_York' WHERE id=$1`,
      [context.location.locationId],
    );
    const company = companyPath(context.membership.organizationId);
    const location = locationPath(
      context.membership.organizationId,
      context.location.locationId,
    );
    const initial = await management.managementGet(
      company,
      context.auth.accessToken,
    );
    const companySet = await management.managementPut(
      `${company}/default`,
      context.auth.accessToken,
      setting(companyWeek, initial.body?.updatedAt),
    );
    expect(companySet.status).toBe(200);

    const inherited = await management.managementGet(
      location,
      context.auth.accessToken,
    );
    expect(inherited.status).toBe(200);
    const inheritedBody = managementLocationSettingsResponseSchema.parse(
      inherited.body,
    );
    expect(inheritedBody.timezone).toBe("America/New_York");
    expect(inheritedBody.settings.operatingHours).toEqual({
      default: companyWeek,
      effective: companyWeek,
      override: null,
      overridePresent: false,
    });

    const storedBefore = await storedCompanyHours(
      context.membership.organizationId,
    );
    expect(storedBefore).toHaveLength(7);
    expect(new Set(storedBefore.map((row) => row.opens_type))).toEqual(
      new Set(["time without time zone"]),
    );
    expect(new Set(storedBefore.map((row) => row.closes_type))).toEqual(
      new Set(["time without time zone"]),
    );
    expect(
      JSON.stringify(inheritedBody.settings.operatingHours.effective),
    ).toBe(JSON.stringify(companyWeek));

    const dst = await management.query<{ summer: Date; winter: Date }>(
      `SELECT (DATE '2026-01-15' + TIME '09:15') AT TIME ZONE 'America/New_York' AS winter,
              (DATE '2026-07-15' + TIME '09:15') AT TIME ZONE 'America/New_York' AS summer`,
    );
    expect(dst.rows[0]?.winter.toISOString()).toBe("2026-01-15T14:15:00.000Z");
    expect(dst.rows[0]?.summer.toISOString()).toBe("2026-07-15T13:15:00.000Z");

    const overridden = await management.managementPut(
      `${location}/override`,
      context.auth.accessToken,
      setting(locationWeek, inheritedBody.updatedAt),
    );
    expect(overridden.status).toBe(200);
    const overriddenBody = managementLocationSettingsResponseSchema.parse(
      overridden.body,
    );
    expect(overriddenBody.settings.operatingHours).toEqual({
      default: companyWeek,
      effective: locationWeek,
      override: locationWeek,
      overridePresent: true,
    });

    const cleared = await management.managementPost(
      `${location}/override/clear`,
      context.auth.accessToken,
      {
        expectedUpdatedAt: overriddenBody.updatedAt,
        setting: "operatingHours",
      },
    );
    expect(cleared.status).toBe(201);
    const clearedBody = managementLocationSettingsResponseSchema.parse(
      cleared.body,
    );
    expect(clearedBody.settings.operatingHours).toEqual({
      default: companyWeek,
      effective: companyWeek,
      override: null,
      overridePresent: false,
    });
    expect(
      JSON.stringify(
        await storedCompanyHours(context.membership.organizationId),
      ),
    ).toBe(JSON.stringify(storedBefore));
  });

  it("keeps hours informational for Start Parking and key custody", async () => {
    const fixture = await parking.createStartParkingFixture();
    await parking.adminPool.query(
      `INSERT INTO organization_operating_hours(
         organization_id,weekday,is_closed,opens_at,closes_at)
       SELECT $1, weekday, true, NULL, NULL
       FROM unnest(enum_range(NULL::operating_weekday)) AS weekday`,
      [fixture.organizationId],
    );

    const result = await parking.start(fixture);
    expect(result).toMatchObject({
      state: "PARKING",
      taskStatus: "IN_PROGRESS",
    });
    const effects = await parking.effects(fixture);
    expect(effects.projection).toMatchObject({
      session_state: "PARKING",
      task_status: "IN_PROGRESS",
    });
    expect(effects.events.map((event) => event.event_type)).toContain(
      "CHECKED_OUT",
    );
  });
});
