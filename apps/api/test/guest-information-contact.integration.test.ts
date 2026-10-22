import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { ManagementControlPlaneTestFixture } from "./management-control-plane-test-fixture";

const fixture = new ManagementControlPlaneTestFixture();
beforeAll(() => fixture.start(), 120_000);
afterEach(() => fixture.resetLimits());
afterAll(() => fixture.stop(), 60_000);

const inherited = { mode: "INHERIT", value: null };
const unavailable = { mode: "UNAVAILABLE", value: null };
const override = (value: string) => ({ mode: "OVERRIDE", value });

function path(org: string, loc: string) {
  return `/v1/staff/management/organizations/${org}/locations/${loc}/guest-information`;
}

describe("#316 Company default/Location Contact tri-state", () => {
  it("inherits each field independently and hides unconfirmed hours", async () => {
    const user = await fixture.createUser();
    const membership = await fixture.createMembership(user.id);
    const auth = await fixture.nativeLogin(user);
    await fixture.enrollAndAssure(auth);
    const location = await fixture.addLocation(membership.organizationId);
    const company = `/v1/staff/management/organizations/${membership.organizationId}/guest-information/contact/defaults`;
    const base = path(membership.organizationId, location.locationId);
    const blank = await fixture.managementGet(company, auth.accessToken);
    expect(blank.status).toBe(200);
    expect(blank.body).toMatchObject({ revision: 0, values: {
      displayName: null, phone: null, supportUrl: null, hours: null, hoursConfirmed: false,
    } });

    const initialContact = await fixture.managementGet(`${base}/contact`, auth.accessToken);
    expect(initialContact.body).toMatchObject({ revision: 0, values: {
      displayName: inherited, phone: inherited, supportUrl: inherited,
      hours: inherited, hoursConfirmed: false,
    } });
    const defaults = await fixture.managementPut(company, auth.accessToken, {
      expectedRevision: 0,
      values: { displayName: "Guest Desk", phone: "+962790000001",
        supportUrl: "https://example.com/contact", hours: "Sun-Thu 9-5", hoursConfirmed: false },
    });
    expect(defaults.status).toBe(200);
    const inheritedContact = await fixture.managementGet(`${base}/contact`, auth.accessToken);
    expect(inheritedContact.body?.effective).toMatchObject({
      phone: { value: "+962790000001", source: "COMPANY" },
      hours: { value: null, source: "COMPANY" },
    });

    const locationValues = {
      displayName: override("Local Team"),
      phone: unavailable, supportUrl: inherited,
      hours: override("Fri 8-12"), hoursConfirmed: true,
    };
    const localized = await fixture.managementPut(`${base}/contact`, auth.accessToken, {
      expectedRevision: 0, values: locationValues,
    });
    expect(localized.status).toBe(200);
    expect(localized.body?.effective).toMatchObject({
      displayName: { value: "Local Team", source: "LOCATION" },
      phone: { value: null, source: "UNAVAILABLE" },
      supportUrl: { value: "https://example.com/contact", source: "COMPANY" },
      hours: { value: "Fri 8-12", source: "LOCATION" },
    });
    const publicPreview = await fixture.managementGet(`${base}/preview?locale=ar`, auth.accessToken);
    expect(publicPreview.body?.contact).toEqual({
      displayName: "Local Team", phone: null,
      supportUrl: "https://example.com/contact", hours: "Fri 8-12",
    });
    const cleared = await fixture.managementPut(`${base}/contact`, auth.accessToken, {
      expectedRevision: 1,
      values: { ...locationValues, phone: inherited, hours: inherited, hoursConfirmed: false },
    });
    expect(cleared.status).toBe(200);
    expect(cleared.body?.effective).toMatchObject({
      phone: { value: "+962790000001", source: "COMPANY" },
      hours: { value: null, source: "COMPANY" },
    });

    const rejected = await fixture.managementPut(`${base}/contact`, auth.accessToken, {
      expectedRevision: 2,
      values: { ...locationValues, supportUrl: override("http://unsafe.test"), whatsapp: "forbidden" },
    });
    expect(rejected.status).toBe(400);
    const stale = await fixture.managementPut(`${base}/contact`, auth.accessToken, {
      expectedRevision: 1, values: locationValues,
    });
    expect(stale.status).toBe(409);
    expect(stale.body?.code).toBe("CONFIGURATION_CONFLICT");
  });
});
