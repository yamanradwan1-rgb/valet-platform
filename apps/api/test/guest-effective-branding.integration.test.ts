import { randomBytes, randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { hashGuestAccessToken } from "../src/modules/valet-sessions/guest-access-command";
import { ManagementControlPlaneTestFixture } from "./management-control-plane-test-fixture";

const fixture = new ManagementControlPlaneTestFixture();

beforeAll(() => fixture.start(), 120_000);
afterEach(() => fixture.resetLimits());
afterAll(() => fixture.stop(), 60_000);

async function seedGuestVisit(input: {
  entitled?: boolean;
  name: string;
  primaryColor: string;
}) {
  const organizationId = await fixture.createOrganization({
    ...(input.entitled === undefined ? {} : { entitled: input.entitled }),
    name: input.name,
  });
  await fixture.query(
    `UPDATE organizations SET brand_primary_color=$2 WHERE id=$1`,
    [organizationId, input.primaryColor],
  );
  const location = await fixture.addLocation(organizationId);
  const user = await fixture.createUser();
  const membershipId = await fixture.addMembership(
    organizationId,
    user.id,
    "VALET_EMPLOYEE",
  );
  const vehicleId = randomUUID();
  await fixture.query(
    `INSERT INTO vehicles
       (id, organization_id, temporary_descriptor, make, model, color, updated_at)
     VALUES ($1,$2,'Guest branding vehicle','Toyota','Camry','Black',
             clock_timestamp())`,
    [vehicleId, organizationId],
  );
  const rawToken = randomBytes(32).toString("base64url");
  const sessionId = randomUUID();
  await fixture.query(
    `INSERT INTO valet_sessions
       (id, customer_access_token_hash, customer_access_expires_at,
        organization_id, location_id, vehicle_id, state,
        checked_in_by_membership_id, version, updated_at)
     VALUES ($1,$2,clock_timestamp()+interval '1 day',$3,$4,$5,'PARKED',$6,1,
             clock_timestamp())`,
    [
      sessionId,
      hashGuestAccessToken(rawToken),
      organizationId,
      location.locationId,
      vehicleId,
      membershipId,
    ],
  );
  return {
    locationId: location.locationId,
    organizationId,
    rawToken,
    sessionId,
  };
}

function readGuest(rawToken: string) {
  return fixture.request("/v1/guest/session", {
    authorization: `Bearer ${rawToken}`,
    method: "GET",
  });
}

describe("MGT-BE-12 Guest effective branding", () => {
  it("projects current Company defaults, Location overrides, and clear fallback", async () => {
    const state = await seedGuestVisit({
      entitled: false,
      name: "شركة فاليه",
      primaryColor: "#123ABC",
    });
    const initial = await readGuest(state.rawToken);
    expect(initial.status).toBe(200);
    expect(initial.body?.branding).toEqual({
      displayName: "شركة فاليه",
      primaryColor: "#123ABC",
    });

    await fixture.query(
      `UPDATE locations
       SET brand_display_name_override='بوابة الفندق',
           brand_primary_color_override='#ABCDEF',
           updated_at=clock_timestamp()
       WHERE id=$1`,
      [state.locationId],
    );
    expect((await readGuest(state.rawToken)).body?.branding).toEqual({
      displayName: "بوابة الفندق",
      primaryColor: "#ABCDEF",
    });

    await fixture.query(
      `UPDATE locations
       SET brand_display_name_override=NULL, brand_primary_color_override=NULL,
           updated_at=clock_timestamp()
       WHERE id=$1`,
      [state.locationId],
    );
    await fixture.query(
      `UPDATE organizations
       SET name='الاسم الحالي', brand_primary_color='#00AA11',
           updated_at=clock_timestamp()
       WHERE id=$1`,
      [state.organizationId],
    );
    expect((await readGuest(state.rawToken)).body?.branding).toEqual({
      displayName: "الاسم الحالي",
      primaryColor: "#00AA11",
    });
  });

  it("binds branding to the persisted visit and exposes no tenant/commercial internals", async () => {
    const first = await seedGuestVisit({
      entitled: false,
      name: "First Company",
      primaryColor: "#112233",
    });
    const second = await seedGuestVisit({
      entitled: false,
      name: "Second Company",
      primaryColor: "#445566",
    });
    const firstResponse = await readGuest(first.rawToken);
    const secondResponse = await readGuest(second.rawToken);
    expect(firstResponse.body?.branding).toEqual({
      displayName: "First Company",
      primaryColor: "#112233",
    });
    expect(secondResponse.body?.branding).toEqual({
      displayName: "Second Company",
      primaryColor: "#445566",
    });
    const serialized = JSON.stringify(firstResponse.body);
    for (const forbidden of [
      first.organizationId,
      first.locationId,
      "subscription",
      "entitlements",
      "provider",
      "updatedAt",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("remains available when all commercial entitlements are false", async () => {
    const state = await seedGuestVisit({
      name: "Lapsed Company",
      primaryColor: "#778899",
    });
    await fixture.query(
      `UPDATE organization_subscriptions
       SET status='SUSPENDED', dashboard_access_enabled=FALSE,
           report_exports_enabled=FALSE, basic_branding_enabled=FALSE,
           updated_at=clock_timestamp()
       WHERE organization_id=$1`,
      [state.organizationId],
    );
    const response = await readGuest(state.rawToken);
    expect(response.status).toBe(200);
    expect(response.body?.branding).toEqual({
      displayName: "Lapsed Company",
      primaryColor: "#778899",
    });
  });
});
