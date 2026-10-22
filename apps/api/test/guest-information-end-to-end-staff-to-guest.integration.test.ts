import { randomUUID } from "node:crypto";

import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createIssueGuestAccessCommandExecutor } from
  "../src/modules/valet-sessions/guest-access-command";
import { ManagementControlPlaneTestFixture } from
  "./management-control-plane-test-fixture";

/**
 * Complete #316 acceptance chain on a NEW disposable DB/runtime role and
 * randomly assigned loopback port owned by ManagementControlPlaneTestFixture.
 * Do not configure DATABASE_URL/MIGRATION_DATABASE_URL to W7's valet316_qa_*.
 * Never share browser storageState, cookies, API3101 or the active QA fixture.
 *
 * Unlike isolated Staff and Guest tests, this uses Staff-authenticated HTTP
 * mutations and a genuine Guest bearer for the SAME persisted Location.
 */
const fixture = new ManagementControlPlaneTestFixture();
beforeAll(async () => {
  const bootstrap = new URL(
    process.env.TEST_DATABASE_URL ??
    process.env.MIGRATION_DATABASE_URL ??
    "postgresql://valet:valet@127.0.0.1:5432/valet",
  );
  if (!["127.0.0.1", "localhost"].includes(bootstrap.hostname)
    || bootstrap.pathname !== "/valet"
    || bootstrap.port !== "5432") {
    throw new Error(
      "#316 disposable journey refuses nonlocal, nonfixture or active visual QA database.",
    );
  }
  await fixture.start();
}, 120_000);
afterAll(() => fixture.stop(), 60_000);

function locationPath(organizationId: string, locationId: string) {
  return `/v1/staff/management/organizations/${organizationId}/locations/${locationId}/guest-information`;
}
function companyPath(organizationId: string) {
  return `/v1/staff/management/organizations/${organizationId}/guest-information/contact/defaults`;
}
const policy = (enText: string, arText = "") => ({
  en: { text: enText, url: "" },
  ar: { text: arText, url: "" },
});
const inherit = { mode: "INHERIT", value: null };
const unavailable = { mode: "UNAVAILABLE", value: null };
const override = (value: string) => ({ mode: "OVERRIDE", value });

async function issueRealGuest(organizationId: string, locationId: string) {
  const employee = await fixture.createUser();
  const membershipId = await fixture.addMembership(
    organizationId, employee.id, "VALET_EMPLOYEE",
  );
  await fixture.query(
    `INSERT INTO membership_location_access
       (organization_id,membership_id,location_id) VALUES ($1,$2,$3)`,
    [organizationId, membershipId, locationId],
  );
  await fixture.query(
    `INSERT INTO shifts(id,organization_id,location_id,membership_id,status,started_at)
     VALUES($1,$2,$3,$4,'ACTIVE',clock_timestamp())`,
    [randomUUID(), organizationId, locationId, membershipId],
  );
  const vehicleId = randomUUID();
  await fixture.query(
    `INSERT INTO vehicles(id,organization_id,temporary_descriptor,updated_at)
     VALUES($1,$2,'issue316 disposable guest',clock_timestamp())`,
    [vehicleId, organizationId],
  );
  const sessionId = randomUUID();
  await fixture.query(
    `INSERT INTO valet_sessions(
       id,customer_access_token_hash,customer_access_expires_at,
       organization_id,location_id,vehicle_id,state,checked_in_by_membership_id,
       check_in_condition_completed_at,check_in_condition_completed_by_membership_id,
       version,updated_at
     ) VALUES (
       $1,$2,clock_timestamp()+interval '1 hour',
       $3,$4,$5,'PARKED',$6,clock_timestamp(),$6,1,clock_timestamp()
     )`,
    [sessionId, `hash:${sessionId}`, organizationId, locationId, vehicleId, membershipId],
  );
  const runtimePool = new Pool({ connectionString: fixture.runtimeDatabaseUrl() });
  try {
    const issued = await createIssueGuestAccessCommandExecutor(runtimePool)({
      authenticatedUserId: employee.id,
      intent: "ISSUE_OR_ROTATE",
      valetSessionId: sessionId,
    });
    return { sessionId, token: issued.rawToken };
  } finally {
    await runtimePool.end();
  }
}

describe("#316 genuine Staff HTTP → PostgreSQL → Guest HTTP journey", () => {
  it("preserves per-Locale publication across Staff edits, Contact tri-state, unpublish and Guest revocation", async () => {
    const staff = await fixture.createUser();
    const membership = await fixture.createMembership(staff.id);
    const organizationId = membership.organizationId;
    const location = await fixture.addLocation(organizationId, { name: "QA-only Location" });
    const locationId = location.locationId;
    const otherLocation = await fixture.addLocation(organizationId, { name: "QA-only B" });
    const auth = await fixture.nativeLogin(staff);
    await fixture.enrollAndAssure(auth);
    const guest = await issueRealGuest(organizationId, locationId);
    const guestB = await issueRealGuest(organizationId, otherLocation.locationId);
    const loc = locationPath(organizationId, locationId);

    const staffGet = (path: string) => fixture.managementGet(path, auth.accessToken);
    const staffPut = (path: string, body: unknown) =>
      fixture.managementPut(path, auth.accessToken, body);
    const staffPost = (path: string, body: unknown) =>
      fixture.managementPost(path, auth.accessToken, body);
    const guestGet = (locale: "en" | "ar", token = guest.token) => fixture.request(
      `/v1/guest/information?locale=${locale}`,
      { authorization: `Bearer ${token}`, method: "GET" },
    );

    const emptyGuest = await guestGet("en");
    expect(emptyGuest.status).toBe(200);
    expect(emptyGuest.body?.privacy).toMatchObject({
      status: "UNAVAILABLE", text: null,
    });
    expect(emptyGuest.headers.get("cache-control")).toContain("no-store");
    const initialOverview = await staffGet(
      `/v1/staff/management/organizations/${organizationId}/guest-information/overview?locale=en`,
    );
    expect(initialOverview.status).toBe(200);
    expect(initialOverview.body).toMatchObject({ publishedCount: 0 });
    expect(initialOverview.body?.locations).toHaveLength(2);

    const draftOne = await staffPut(`${loc}/privacy`, {
      expectedRevision: 0, drafts: policy("Published English A"),
    });
    expect(draftOne).toMatchObject({ status: 200, body: { revision: 1 } });
    const beforePublish = await guestGet("en");
    expect(beforePublish.body?.privacy).toMatchObject({
      status: "UNAVAILABLE", text: null,
    });
    expect(JSON.stringify(beforePublish.body)).not.toContain("Published English A");

    const publishedOne = await staffPost(`${loc}/privacy/publish`, {
      expectedRevision: 1,
    });
    expect(publishedOne).toMatchObject({
      status: 201, body: { revision: 2, publishedVersion: 1 },
    });
    expect((await guestGet("en")).body?.privacy).toMatchObject({
      status: "PUBLISHED", text: "Published English A", version: 1,
    });
    expect((await guestGet("ar")).body?.privacy).toMatchObject({
      status: "UNAVAILABLE", text: null,
    });
    const publishedOverview = await staffGet(
      `/v1/staff/management/organizations/${organizationId}/guest-information/overview?locale=en`,
    );
    expect(publishedOverview.body).toMatchObject({ publishedCount: 1 });

    const company = await staffPut(companyPath(organizationId), {
      expectedRevision: 0,
      values: {
        displayName: "QA Company Desk", phone: "+15550101000",
        supportUrl: "https://example.com/qa316", hours: "Sunday 9–5",
        hoursConfirmed: false,
      },
    });
    expect(company).toMatchObject({ status: 200, body: { revision: 1 } });
    const inheritedGuest = await guestGet("en");
    expect(inheritedGuest.body?.contact).toMatchObject({
      displayName: "QA Company Desk", phone: "+15550101000",
      supportUrl: "https://example.com/qa316", hours: null,
    });
    expect((await guestGet("en", guestB.token)).body?.contact).toMatchObject({
      displayName: "QA Company Desk", phone: "+15550101000",
      supportUrl: "https://example.com/qa316", hours: null,
    });
    const overridePhone = await staffPut(`${loc}/contact`, {
      expectedRevision: 0,
      values: {
        displayName: override("QA Location Desk"),
        phone: override("+15550101001"),
        supportUrl: inherit,
        hours: override("Friday 8–12"), hoursConfirmed: true,
      },
    });
    expect(overridePhone).toMatchObject({ status: 200, body: { revision: 1 } });
    expect((await guestGet("en")).body?.contact).toMatchObject({
      displayName: "QA Location Desk", phone: "+15550101001",
    });
    expect((await guestGet("en", guestB.token)).body?.contact).toMatchObject({
      displayName: "QA Company Desk", phone: "+15550101000",
    });
    const hidePhone = await staffPut(`${loc}/contact`, {
      expectedRevision: 1,
      values: {
        displayName: override("QA Location Desk"),
        phone: unavailable, supportUrl: inherit,
        hours: override("Friday 8–12"), hoursConfirmed: true,
      },
    });
    expect(hidePhone).toMatchObject({ status: 200, body: { revision: 2 } });
    const resolvedGuest = await guestGet("en");
    expect(resolvedGuest.body?.contact).toMatchObject({
      displayName: "QA Location Desk", phone: null,
      supportUrl: "https://example.com/qa316", hours: "Friday 8–12",
    });
    expect((await guestGet("en", guestB.token)).body?.contact).toMatchObject({
      displayName: "QA Company Desk", phone: "+15550101000",
    });
    const resetPhone = await staffPut(`${loc}/contact`, {
      expectedRevision: 2,
      values: {
        displayName: override("QA Location Desk"),
        phone: inherit, supportUrl: inherit,
        hours: override("Friday 8–12"), hoursConfirmed: true,
      },
    });
    expect(resetPhone).toMatchObject({ status: 200, body: { revision: 3 } });
    expect((await guestGet("en")).body?.contact).toMatchObject({
      displayName: "QA Location Desk", phone: "+15550101000",
    });

    const nextDraft = await staffPut(`${loc}/privacy`, {
      expectedRevision: 2, drafts: policy("Published English B", "سياسة عربية منشورة"),
    });
    expect(nextDraft).toMatchObject({ status: 200, body: { revision: 3 } });
    const oldGuest = await guestGet("en");
    expect(oldGuest.body?.privacy).toMatchObject({
      status: "PUBLISHED", text: "Published English A", version: 1,
    });
    expect(JSON.stringify(oldGuest.body)).not.toContain("Published English B");
    const stale = await staffPost(`${loc}/privacy/publish`, { expectedRevision: 2 });
    expect(stale.status).toBe(409);
    expect((await staffPost(`${loc}/privacy/publish`, {
      expectedRevision: 3,
    })).status).toBe(201);
    expect((await guestGet("ar")).body?.privacy).toMatchObject({
      status: "PUBLISHED", text: "سياسة عربية منشورة", version: 2,
    });
    expect((await guestGet("en")).body?.privacy).toMatchObject({
      status: "PUBLISHED", text: "Published English B", version: 2,
    });
    const publicationRows = await fixture.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM guest_privacy_publications
       WHERE organization_id=$1 AND location_id=$2`,
      [organizationId, locationId],
    );
    expect(publicationRows.rows[0]?.count).toBe("2");
    const final = await staffPost(`${loc}/privacy/unpublish`, {
      expectedRevision: 4,
    });
    expect(final).toMatchObject({
      status: 201, body: { revision: 5, publishedVersion: null },
    });
    const after = await guestGet("en");
    expect(after.body?.privacy).toMatchObject({
      status: "UNAVAILABLE", text: null,
    });
    expect(JSON.stringify(after.body)).not.toMatch(/Published English A|Published English B/);
    expect((await guestGet("ar")).body?.privacy).toMatchObject({
      status: "UNAVAILABLE", text: null,
    });
    expect((await staffGet(`${loc}/privacy`)).body?.drafts).toMatchObject(
      policy("Published English B", "سياسة عربية منشورة"),
    );
    await fixture.query(
      "UPDATE valet_sessions SET customer_access_revoked_at=clock_timestamp() WHERE id=$1",
      [guest.sessionId],
    );
    const revoked = await guestGet("en");
    expect(revoked.status).toBe(401);
    expect(JSON.stringify(revoked.body)).not.toContain("QA Location Desk");
    await fixture.query(
      `UPDATE valet_sessions
       SET customer_access_revoked_at=NULL,
           customer_access_expires_at=clock_timestamp()-interval '1 second'
       WHERE id=$1`,
      [guest.sessionId],
    );
    const expired = await guestGet("en");
    expect(expired.status).toBe(401);
    expect(JSON.stringify(expired.body)).not.toContain("QA Location Desk");
  }, 90_000);
});
