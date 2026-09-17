import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { ManagementAuditTestFixture } from "./management-audit-test-fixture";

const fixture = new ManagementAuditTestFixture();

beforeAll(() => fixture.start(), 120_000);
afterEach(() => fixture.resetLimits());
afterAll(() => fixture.stop(), 60_000);

function organizationPath(organizationId: string): string {
  return `/v1/staff/management/organizations/${organizationId}/audit-events`;
}

function locationPath(organizationId: string, locationId: string): string {
  return `/v1/staff/management/organizations/${organizationId}/locations/${locationId}/audit-events`;
}

function eventIds(body: unknown): string[] {
  const items = (body as { items?: Array<{ eventId?: unknown }> } | undefined)
    ?.items;
  return (items ?? []).map((item) => String(item.eventId));
}

async function assuredAdmin() {
  const user = await fixture.createUser();
  const membership = await fixture.createMembership(user.id);
  const firstLocation = await fixture.addLocation(membership.organizationId);
  const secondLocation = await fixture.addLocation(membership.organizationId);
  const auth = await fixture.nativeLogin(user);
  await fixture.enrollAndAssure(auth);
  return { auth, firstLocation, membership, secondLocation, user };
}

describe("MGT-BE-06 Management audit HTTP scope and read side effects", () => {
  it("uses persisted tenant/location columns for scope and never widens from metadata", async () => {
    const state = await assuredAdmin();
    const foreignOrganizationId = await fixture.createOrganization();
    const foreignLocation = await fixture.addLocation(foreignOrganizationId);
    const orgWide = await fixture.insertAuditEvent({
      eventType: "VALET_SESSION_CREATED",
      organizationId: state.membership.organizationId,
    });
    const firstLocation = await fixture.insertAuditEvent({
      eventType: "VALET_SESSION_CREATED",
      locationId: state.firstLocation.locationId,
      organizationId: state.membership.organizationId,
    });
    const secondLocation = await fixture.insertAuditEvent({
      eventType: "VALET_SESSION_CREATED",
      locationId: state.secondLocation.locationId,
      organizationId: state.membership.organizationId,
    });
    const metadataTrick = await fixture.insertAuditEvent({
      eventType: "VALET_SESSION_CREATED",
      locationId: state.secondLocation.locationId,
      metadata: {
        locationId: state.firstLocation.locationId,
        organizationId: state.membership.organizationId,
      },
      organizationId: state.membership.organizationId,
    });
    const foreign = await fixture.insertAuditEvent({
      eventType: "VALET_SESSION_CREATED",
      locationId: foreignLocation.locationId,
      metadata: {
        locationId: state.firstLocation.locationId,
        organizationId: state.membership.organizationId,
      },
      organizationId: foreignOrganizationId,
    });

    const organization = await fixture.managementGet(
      organizationPath(state.membership.organizationId),
      state.auth.accessToken,
    );
    expect(organization.status).toBe(200);
    expect(new Set(eventIds(organization.body))).toEqual(
      new Set([orgWide, firstLocation, secondLocation, metadataTrick]),
    );
    expect(eventIds(organization.body)).not.toContain(foreign);

    const location = await fixture.managementGet(
      locationPath(
        state.membership.organizationId,
        state.firstLocation.locationId,
      ),
      state.auth.accessToken,
    );
    expect(location.status).toBe(200);
    expect(eventIds(location.body)).toEqual([firstLocation]);
    expect(eventIds(location.body)).not.toContain(orgWide);
    expect(eventIds(location.body)).not.toContain(metadataTrick);
  });

  it("never returns account-security audit rows through tenant audit", async () => {
    const state = await assuredAdmin();
    const tenantEventId = await fixture.insertAuditEvent({
      eventType: "VALET_SESSION_CREATED",
      locationId: state.firstLocation.locationId,
      organizationId: state.membership.organizationId,
    });
    const securityEventId = await fixture.insertAccountSecurityEvent({
      actorUserId: state.user.id,
      eventType: "ACCOUNT_SECURITY_TEST",
      subjectUserId: state.user.id,
    });

    const response = await fixture.managementGet(
      organizationPath(state.membership.organizationId),
      state.auth.accessToken,
    );
    expect(response.status).toBe(200);
    expect(eventIds(response.body)).toEqual([tenantEventId]);
    const serialized = JSON.stringify(response.body);
    expect(serialized).not.toContain(securityEventId);
    expect(serialized).not.toContain("ACCOUNT_SECURITY_TEST");
  });

  it("creates no tenant AuditEvent for successful or denied reads", async () => {
    const state = await assuredAdmin();
    await fixture.insertAuditEvent({
      eventType: "VALET_SESSION_CREATED",
      locationId: state.firstLocation.locationId,
      organizationId: state.membership.organizationId,
    });
    const beforeSuccess = await fixture.auditCount(state.membership.organizationId);
    const success = await fixture.managementGet(
      organizationPath(state.membership.organizationId),
      state.auth.accessToken,
    );
    expect(success.status).toBe(200);
    expect(await fixture.auditCount(state.membership.organizationId)).toBe(
      beforeSuccess,
    );

    const employee = await fixture.createUser();
    await fixture.addMembership(
      state.membership.organizationId,
      employee.id,
      "VALET_EMPLOYEE",
    );
    const employeeAuth = await fixture.nativeLogin(employee);
    const beforeDenied = await fixture.auditCount(state.membership.organizationId);
    const denied = await fixture.managementGet(
      organizationPath(state.membership.organizationId),
      employeeAuth.accessToken,
    );
    expect(denied.status).toBe(404);
    expect(denied.body).toMatchObject({ code: "AUTHORIZATION_DENIED" });
    expect(await fixture.auditCount(state.membership.organizationId)).toBe(
      beforeDenied,
    );
  });
});
