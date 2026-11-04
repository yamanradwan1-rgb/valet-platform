import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ManagementAlertMfaFixture } from "./management-alert-mfa-fixture";

const fixture = new ManagementAlertMfaFixture();
const oldFlags = {
  enabled: process.env.MANAGEMENT_ALERTS_PHASE1_ENABLED,
  cutover: process.env.MANAGEMENT_ALERTS_PHASE1_DISPATCH_POST_LOCK_CUTOVER,
};

const previewPath = (locationId: string) =>
  `/v1/staff/dashboard/locations/${locationId}/alerts/preview`;
const exactPath = (locationId: string, sourceId: string, episodeId: string) =>
  `/v1/staff/dashboard/locations/${locationId}/alerts/sources/ALT-08/${sourceId}?episodeId=${encodeURIComponent(episodeId)}`;

beforeAll(async () => {
  process.env.MANAGEMENT_ALERTS_PHASE1_ENABLED = "disabled";
  await fixture.start();
  const serverClock = await fixture.query<{ now: Date }>(
    "SELECT clock_timestamp() AS now",
  );
  process.env.MANAGEMENT_ALERTS_PHASE1_DISPATCH_POST_LOCK_CUTOVER =
    serverClock.rows[0]!.now.toISOString();
}, 180_000);

afterAll(async () => {
  await fixture.stop();
  for (const [envKey, old] of [
    ["MANAGEMENT_ALERTS_PHASE1_ENABLED", oldFlags.enabled],
    ["MANAGEMENT_ALERTS_PHASE1_DISPATCH_POST_LOCK_CUTOVER", oldFlags.cutover],
  ] as const) {
    if (old === undefined) delete process.env[envKey];
    else process.env[envKey] = old;
  }
}, 120_000);

async function seedIncident(input: {
  organizationId: string;
  locationId: string;
  reporterMembershipId: string;
}) {
  const vehicleId = randomUUID();
  const sessionId = randomUUID();
  const incidentId = randomUUID();
  const plate = vehicleId.slice(0, 8);
  await fixture.query(
    `INSERT INTO vehicles (id,organization_id,plate_country,
      plate_number_raw,plate_number_normalized,updated_at)
     VALUES ($1,$2,'JO',$3,$3,clock_timestamp())`,
    [vehicleId, input.organizationId, plate],
  );
  await fixture.query(
    `INSERT INTO valet_sessions
       (id, customer_access_token_hash, customer_access_expires_at,
        organization_id,location_id,vehicle_id,state,
        checked_in_by_membership_id,updated_at)
     VALUES($1,$2,clock_timestamp()+interval '1 day',$3,$4,$5,'PARKED',$6,
       clock_timestamp())`,
    [
      sessionId,
      randomUUID(),
      input.organizationId,
      input.locationId,
      vehicleId,
      input.reporterMembershipId,
    ],
  );
  await fixture.query(
    `INSERT INTO incidents
       (id,organization_id,location_id,valet_session_id,status,severity,
        type,description,reported_by_membership_id,created_at)
     VALUES($1,$2,$3,$4,'OPEN','HIGH','KEY_MISSING',
       'private incident description',$5,clock_timestamp())`,
    [
      incidentId,
      input.organizationId,
      input.locationId,
      sessionId,
      input.reporterMembershipId,
    ],
  );
  return incidentId;
}

describe("Issue #414 mounted HTTP preview and exact detail (PG17 MFA ON)", () => {
  it("keeps rollout OFF by default and preserves no-store on denial", async () => {
    const admin = await fixture.createAssuredAdmin();
    const mfaBefore = (await fixture.sessionSnapshot(admin.auth.sessionId))
      .rows[0]!;
    const denied = await fixture.managementGet(
      previewPath(admin.location.locationId),
      admin.auth.accessToken,
    );
    expect(denied.status).toBe(404);
    expect(denied.headers.get("cache-control")).toContain("no-store");

    process.env.MANAGEMENT_ALERTS_PHASE1_ENABLED = "enabled";
    const available = await fixture.managementGet(
      previewPath(admin.location.locationId),
      admin.auth.accessToken,
    );
    expect(available.status).toBe(200);
    expect(available.body).toMatchObject({
      items: [],
      count: 0,
      hasMore: false,
    });
    expect(available.headers.get("cache-control")).toContain("no-store");
    for (let iteration = 0; iteration < 3; iteration += 1) {
      expect(
        (
          await fixture.managementGet(
            previewPath(admin.location.locationId),
            admin.auth.accessToken,
          )
        ).status,
      ).toBe(200);
    }
    const rotated = await fixture.refresh(admin.auth.refreshToken);
    expect(rotated.status).toBe(200);
    const latestAccessToken = String(rotated.body?.accessToken);
    expect(
      (
        await fixture.managementGet(
          previewPath(admin.location.locationId),
          latestAccessToken,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await fixture.managementGet(
          previewPath(admin.location.locationId),
          admin.auth.accessToken,
        )
      ).status,
    ).toBe(401);
    const mfaAfter = (await fixture.sessionSnapshot(admin.auth.sessionId))
      .rows[0]!;
    expect(mfaAfter.last_admin_activity_at).toEqual(
      mfaBefore.last_admin_activity_at,
    );
    expect(mfaAfter.mfa_authenticated_at).toEqual(
      mfaBefore.mfa_authenticated_at,
    );
    const noToken = await fixture.request(
      previewPath(admin.location.locationId),
      {
        method: "GET",
      },
    );
    expect(noToken.status).toBe(401);
  });

  it("checks exact source and episode by fresh bearer, without description", async () => {
    const admin = await fixture.createAssuredAdmin();
    const incidentId = await seedIncident({
      organizationId: admin.membership.organizationId,
      locationId: admin.location.locationId,
      reporterMembershipId: admin.membership.membershipId,
    });
    const alerts = await fixture.managementGet(
      previewPath(admin.location.locationId),
      admin.auth.accessToken,
    );
    expect(alerts.status).toBe(200);
    const item = (alerts.body?.items as Array<{ sourceId: string }>).find(
      (entry) => entry.sourceId === incidentId,
    );
    expect(item).toBeDefined();
    expect(JSON.stringify(alerts.body)).not.toContain("private incident");

    const detail = await fixture.managementGet(
      exactPath(admin.location.locationId, incidentId, incidentId),
      admin.auth.accessToken,
    );
    expect(detail.status).toBe(200);
    expect(detail.body?.item).toMatchObject({
      sourceId: incidentId,
      category: "ALT-08",
    });
    expect(detail.headers.get("cache-control")).toContain("no-store");
    const obsolete = await fixture.managementGet(
      exactPath(admin.location.locationId, incidentId, randomUUID()),
      admin.auth.accessToken,
    );
    expect(obsolete.status).toBe(404);
  });

  it("does not represent a bad source-clock boundary as authoritative zero", async () => {
    const admin = await fixture.createAssuredAdmin();
    delete process.env.MANAGEMENT_ALERTS_PHASE1_DISPATCH_POST_LOCK_CUTOVER;
    const failed = await fixture.managementGet(
      previewPath(admin.location.locationId),
      admin.auth.accessToken,
    );
    expect(failed.status).toBe(500);
    expect(failed.body?.code).not.toBe("SUCCESS");
    expect(failed.body?.items).toBeUndefined();
    const clock = await fixture.query<{ now: Date }>(
      "SELECT clock_timestamp() AS now",
    );
    process.env.MANAGEMENT_ALERTS_PHASE1_DISPATCH_POST_LOCK_CUTOVER =
      clock.rows[0]!.now.toISOString();
  });

  it("denies revoked exact Location grant and non-Management roles", async () => {
    const admin = await fixture.createAssuredAdmin();
    const manager = await fixture.createManager(
      admin.membership.organizationId,
    );
    await fixture.grantLocation(
      admin.membership.organizationId,
      manager.membershipId,
      admin.location.locationId,
    );
    const path = previewPath(admin.location.locationId);
    expect(
      (await fixture.managementGet(path, manager.auth.accessToken)).status,
    ).toBe(200);
    await fixture.query(
      "DELETE FROM membership_location_access WHERE membership_id=$1",
      [manager.membershipId],
    );
    expect(
      (await fixture.managementGet(path, manager.auth.accessToken)).status,
    ).toBe(404);

    const staff = await fixture.createUser();
    await fixture.addMembership(
      admin.membership.organizationId,
      staff.id,
      "VALET_SUPERVISOR",
    );
    const supervisor = await fixture.nativeLogin(staff);
    expect(
      (await fixture.managementGet(path, supervisor.accessToken)).status,
    ).toBe(404);
  });
});
