import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { actor, fixture, startLab } from './dashboard-issue319-lab';

type ReadKind = 'branding' | 'subscription';
const kinds = ['branding', 'subscription'] as const;
const route = (locationId: string, kind: ReadKind) =>
  `/v1/staff/dashboard/locations/${locationId}/${kind}`;

async function denied(
  locationId: string,
  accessToken: string,
  kind: ReadKind,
  status = 404,
) {
  const response = await fixture.managementGet(route(locationId, kind), accessToken);
  expect(response.status).toBe(status);
  if (status === 404) {
    expect(response.body).toMatchObject({ code: 'AUTHORIZATION_DENIED' });
  }
  expect(response.body).not.toHaveProperty('displayName');
  expect(response.body).not.toHaveProperty('primaryColor');
  expect(response.body).not.toHaveProperty('subscription');
  expect(response.body).not.toHaveProperty('organizationId');
}

beforeAll(startLab, 180_000);
afterAll(() => fixture.stop(), 90_000);

describe('Issue319 adjacent Branding/Subscription eligibility, real HTTP and isolated PG', () => {
  it('eligible LM Branding GET returns the exact stored default/override projection', async () => {
    const a = await actor();
    const saved = await fixture.query<{
      name: string;
      primaryColor: string;
      displayOverride: string | null;
      colorOverride: string | null;
      updatedAt: Date;
    }>(`SELECT organization.name AS name,
        organization.brand_primary_color AS "primaryColor",
        location.brand_display_name_override AS "displayOverride",
        location.brand_primary_color_override AS "colorOverride",
        location.updated_at AS "updatedAt"
      FROM locations AS location JOIN organizations AS organization
        ON organization.id=location.organization_id WHERE location.id=$1`,
    [a.locationId]);
    const row = saved.rows[0]!;
    const response = await fixture.managementGet(
      route(a.locationId, 'branding'), a.auth.accessToken,
    );
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      locationId: a.locationId,
      updatedAt: row.updatedAt.toISOString(),
      displayName: {
        default: row.name,
        effective: row.displayOverride ?? row.name,
        override: row.displayOverride,
        overridePresent: row.displayOverride !== null,
      },
      primaryColor: {
        default: row.primaryColor,
        effective: row.colorOverride ?? row.primaryColor,
        override: row.colorOverride,
        overridePresent: row.colorOverride !== null,
      },
    });
  });

  it('eligible LM Subscription GET returns its exact subscription entitlement projection', async () => {
    const a = await actor();
    const response = await fixture.managementGet(
      route(a.locationId, 'subscription'), a.auth.accessToken,
    );
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      locationId: a.locationId,
      organizationId: a.organizationId,
      subscription: {
        planCode: 'TEST_ENTITLED',
        status: 'ACTIVE',
        entitlements: {
          dashboardAccess: true,
          reportExports: true,
          basicBranding: true,
        },
      },
    });
  });

  it.each(kinds)('%s rejects an MFA-assured Company Admin with no LM fallback', async (kind) => {
    const admin = await actor('ORG_ADMIN'); // actor() enrolls and assures MFA.
    await denied(admin.locationId, admin.auth.accessToken, kind);
  });

  it.each(kinds)('%s rejects cross-tenant, ungranted and unknown Locations', async (kind) => {
    const manager = await actor();
    const foreign = await actor();
    const ungranted = await fixture.addLocation(manager.organizationId);
    for (const locationId of [
      foreign.locationId,
      ungranted.locationId,
      '00000000-0000-4000-8000-000000000001',
    ]) {
      await denied(locationId, manager.auth.accessToken, kind);
    }
  });

  it.each(kinds)('%s rejects an inactive LM membership', async (kind) => {
    const a = await actor();
    await fixture.query(
      "UPDATE organization_memberships SET status='INACTIVE' WHERE id=$1",
      [a.membershipId],
    );
    await denied(a.locationId, a.auth.accessToken, kind);
  });

  it.each(kinds)('%s rejects an LM downgraded to employee', async (kind) => {
    const a = await actor();
    await fixture.query(
      "UPDATE organization_memberships SET role='VALET_EMPLOYEE' WHERE id=$1",
      [a.membershipId],
    );
    await denied(a.locationId, a.auth.accessToken, kind);
  });

  it.each(kinds)('%s denies a disabled LM user at authentication', async (kind) => {
    const a = await actor();
    await fixture.query("UPDATE users SET status='DISABLED' WHERE id=$1", [a.user.id]);
    await denied(a.locationId, a.auth.accessToken, kind, 401);
  });

  it('Branding requires BASIC_BRANDING even with DASHBOARD_ACCESS enabled', async () => {
    const a = await actor();
    await fixture.query(`UPDATE organization_subscriptions
      SET dashboard_access_enabled=TRUE, basic_branding_enabled=FALSE,
          updated_at=clock_timestamp() WHERE organization_id=$1`,
    [a.organizationId]);
    await denied(a.locationId, a.auth.accessToken, 'branding');
  });

  it('Subscription remains available with DASHBOARD_ACCESS disabled and reports false', async () => {
    const a = await actor();
    await fixture.query(`UPDATE organization_subscriptions
      SET plan_code='ISSUE319_ELIGIBILITY', status='ACTIVE',
          dashboard_access_enabled=FALSE, report_exports_enabled=FALSE,
          basic_branding_enabled=TRUE, updated_at=clock_timestamp()
      WHERE organization_id=$1`, [a.organizationId]);
    const response = await fixture.managementGet(
      route(a.locationId, 'subscription'), a.auth.accessToken,
    );
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      locationId: a.locationId,
      organizationId: a.organizationId,
      subscription: {
        planCode: 'ISSUE319_ELIGIBILITY',
        status: 'ACTIVE',
        entitlements: {
          dashboardAccess: false,
          reportExports: false,
          basicBranding: true,
        },
      },
    });
  });
});
