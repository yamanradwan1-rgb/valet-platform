import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { ManagementControlPlaneTestFixture } from "./management-control-plane-test-fixture";

const fixture = new ManagementControlPlaneTestFixture();
beforeAll(() => fixture.start(), 120_000);
afterEach(() => fixture.resetLimits());
afterAll(() => fixture.stop(), 60_000);

function path(organizationId: string, locationId: string) {
  return `/v1/staff/management/organizations/${organizationId}/locations/${locationId}/guest-information`;
}

async function companyAdmin() {
  const user = await fixture.createUser();
  const member = await fixture.createMembership(user.id);
  const auth = await fixture.nativeLogin(user);
  await fixture.enrollAndAssure(auth);
  const location = await fixture.addLocation(member.organizationId);
  return { auth, member, location };
}

const drafts = (english: string, arabic = "") => ({
  en: { text: english, url: "" },
  ar: { text: arabic, url: "" },
});

describe("#316 Location Privacy draft/publication", () => {
  it("keeps drafts private, publishes immutable locale snapshots and unpublishes without history loss", async () => {
    const actor = await companyAdmin();
    const base = path(actor.member.organizationId, actor.location.locationId);
    const first = await fixture.managementGet(`${base}/privacy`, actor.auth.accessToken);
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({
      revision: 0, updatedAt: null, published: null, publishedVersion: null,
      drafts: drafts(""),
    });

    const policyText = "<b>Tenant-owned policy</b> & terms";
    const saved = await fixture.managementPut(`${base}/privacy`, actor.auth.accessToken, {
      expectedRevision: 0, drafts: drafts(policyText),
    });
    expect(saved.status).toBe(200);
    expect(saved.body).toMatchObject({ revision: 1, drafts: drafts(policyText), published: null });
    const unpublished = await fixture.managementGet(`${base}/preview?locale=en`, actor.auth.accessToken);
    expect(unpublished.status).toBe(200);
    expect(unpublished.body).toMatchObject({
      locale: "en", privacy: { status: "UNAVAILABLE", text: null, version: null },
    });
    expect(JSON.stringify(unpublished.body)).not.toContain("Tenant-owned policy");

    const published = await fixture.managementPost(`${base}/privacy/publish`, actor.auth.accessToken, {
      expectedRevision: 1,
    });
    expect(published.status).toBe(201);
    expect(published.body).toMatchObject({
      revision: 2, publishedVersion: 1, published: drafts(policyText),
    });
    const en = await fixture.managementGet(`${base}/preview?locale=en`, actor.auth.accessToken);
    expect(en.body).toMatchObject({
      locale: "en", privacy: { status: "PUBLISHED", text: policyText, version: 1 },
    });
    const ar = await fixture.managementGet(`${base}/preview?locale=ar`, actor.auth.accessToken);
    expect(ar.body).toMatchObject({
      locale: "ar", privacy: { status: "UNAVAILABLE", text: null, version: null },
    });
    expect(en.headers.get("cache-control")).toContain("no-store");

    const secondDraft = await fixture.managementPut(`${base}/privacy`, actor.auth.accessToken, {
      expectedRevision: 2, drafts: drafts("Unpublished revision two", "سياسة غير منشورة"),
    });
    expect(secondDraft.status).toBe(200);
    const unchanged = await fixture.managementGet(`${base}/preview?locale=en`, actor.auth.accessToken);
    expect(unchanged.body?.privacy).toMatchObject({ text: policyText });
    const conflict = await fixture.managementPut(`${base}/privacy`, actor.auth.accessToken, {
      expectedRevision: 2, drafts: drafts("Race loser"),
    });
    expect(conflict.status).toBe(409);
    expect(conflict.body?.code).toBe("CONFIGURATION_CONFLICT");

    const hidden = await fixture.managementPost(`${base}/privacy/unpublish`, actor.auth.accessToken, {
      expectedRevision: 3,
    });
    expect(hidden.status).toBe(201);
    expect(hidden.body).toMatchObject({ revision: 4, published: null, publishedVersion: null });
    const after = await fixture.managementGet(`${base}/preview?locale=en`, actor.auth.accessToken);
    expect(after.body?.privacy).toMatchObject({ status: "UNAVAILABLE" });
    const history = await fixture.query<{ count: string; en_text: string }>(
      `SELECT count(*)::text AS count, max(en_text) AS en_text
       FROM guest_privacy_publications WHERE organization_id=$1 AND location_id=$2`,
      [actor.member.organizationId, actor.location.locationId]);
    expect(history.rows[0]).toMatchObject({ count: "1", en_text: policyText });
  });

  it("rejects invalid URLs and publication without real content; conceals foreign scope", async () => {
    const actor = await companyAdmin();
    const foreign = await fixture.createOrganization();
    const otherLocation = await fixture.addLocation(foreign);
    const base = path(actor.member.organizationId, actor.location.locationId);
    const invalid = await fixture.managementPut(`${base}/privacy`, actor.auth.accessToken, {
      expectedRevision: 0,
      drafts: { en: { text: "", url: "javascript:alert(1)" }, ar: { text: "", url: "" } },
    });
    expect(invalid.status).toBe(400);
    expect(invalid.body?.code).toBe("REQUEST_INVALID");
    const emptyPublish = await fixture.managementPost(`${base}/privacy/publish`, actor.auth.accessToken, {
      expectedRevision: 0,
    });
    expect([400, 409]).toContain(emptyPublish.status);
    const wrong = await fixture.managementGet(
      `${path(actor.member.organizationId, otherLocation.locationId)}/privacy`,
      actor.auth.accessToken);
    expect(wrong.status).toBe(404);
    expect(wrong.body?.code).toBe("AUTHORIZATION_DENIED");
    expect(wrong.headers.get("cache-control")).toContain("no-store");
  });
});
