import { randomUUID } from "node:crypto";

import {
  authorizeDashboardLocation,
  type DashboardLocationScope,
} from "../src/modules/dashboard/dashboard-location-authorization";
import {
  listAuthorizedDashboardLocations,
  type AuthorizedDashboardLocation,
} from "../src/modules/dashboard/dashboard-location-scope-query";
import {
  ShiftTestContext,
  type ShiftFixture,
  type ShiftFixtureOptions,
  type TestRole,
} from "./shift-test-context";

export interface DashboardActor {
  readonly membershipId: string;
  readonly userId: string;
}

export class DashboardTestContext extends ShiftTestContext {
  constructor(label: string) {
    super(`009a_${label}`);
  }

  override async createFixture(
    options: ShiftFixtureOptions = {},
    existingUserId?: string,
  ): Promise<ShiftFixture> {
    const fixture = await super.createFixture(options, existingUserId);
    await this.adminPool.query(
      `INSERT INTO organization_subscriptions
         (organization_id, plan_code, status, dashboard_access_enabled,
          report_exports_enabled, basic_branding_enabled)
       VALUES ($1, 'TEST_ENTITLED', 'ACTIVE', TRUE, TRUE, TRUE)
       ON CONFLICT (organization_id) DO UPDATE
       SET plan_code='TEST_ENTITLED', status='ACTIVE',
           dashboard_access_enabled=TRUE, report_exports_enabled=TRUE,
           basic_branding_enabled=TRUE, updated_at=clock_timestamp()`,
      [fixture.organizationId],
    );
    return fixture;
  }

  async authorize(input: {
    authenticatedUserId: string;
    locationId?: string;
  }): Promise<DashboardLocationScope | null> {
    const client = await this.runtimePool.connect();
    try {
      return await authorizeDashboardLocation(
        client,
        input.authenticatedUserId,
        input.locationId ?? randomUUID(),
      );
    } finally {
      client.release();
    }
  }

  async enumerate(
    authenticatedUserId: string,
  ): Promise<AuthorizedDashboardLocation[]> {
    const client = await this.runtimePool.connect();
    try {
      return await listAuthorizedDashboardLocations(
        client,
        authenticatedUserId,
      );
    } finally {
      client.release();
    }
  }

  manager(fixture: ShiftFixture) {
    return this.createActor(fixture, "LOCATION_MANAGER");
  }

  async createActor(
    fixture: ShiftFixture,
    role: TestRole,
    options: { access?: boolean } = {},
  ): Promise<DashboardActor> {
    const userId = randomUUID();
    const membershipId = randomUUID();
    await this.adminPool.query(
      `INSERT INTO users (id, email, password_hash, status, updated_at)
       VALUES ($1, $2, 'not-a-real-password-hash', 'ACTIVE',
               transaction_timestamp())`,
      [userId, `${userId}@val-009a.test`],
    );
    await this.adminPool.query(
      `INSERT INTO organization_memberships
         (id, organization_id, user_id, role, status, updated_at)
       VALUES ($1, $2, $3, $4, 'ACTIVE', transaction_timestamp())`,
      [membershipId, fixture.organizationId, userId, role],
    );
    if (options.access !== false) {
      await this.grantAccess(fixture, membershipId);
    }
    return { membershipId, userId };
  }

  async grantAccess(
    fixture: ShiftFixture,
    membershipId: string,
    locationId = fixture.locationId,
  ): Promise<void> {
    await this.adminPool.query(
      `INSERT INTO membership_location_access
         (organization_id, membership_id, location_id)
       VALUES ($1, $2, $3)`,
      [fixture.organizationId, membershipId, locationId],
    );
  }

  async addLocation(
    fixture: ShiftFixture,
    options: {
      access?: boolean;
      name?: string;
      status?: "ACTIVE" | "INACTIVE";
    } = {},
  ): Promise<string> {
    const locationId = randomUUID();
    const status = options.status ?? "ACTIVE";
    await this.adminPool.query(
      `INSERT INTO locations
         (id, organization_id, name, code, address_text, timezone, currency,
          status, accepting_intake, updated_at)
       VALUES ($1, $2, $3, $4, 'Address', 'Asia/Amman', 'JOD', $5,
               $6, transaction_timestamp())`,
      [
        locationId,
        fixture.organizationId,
        options.name ?? `Dashboard location ${locationId}`,
        locationId,
        status,
        status === "ACTIVE",
      ],
    );
    if (options.access !== false) {
      await this.grantAccess(fixture, fixture.membershipId, locationId);
    }
    return locationId;
  }

  async startActiveShift(
    fixture: ShiftFixture,
    actor: DashboardActor,
  ): Promise<void> {
    await this.adminPool.query(
      `INSERT INTO shifts
         (id, organization_id, location_id, membership_id, status, started_at)
       VALUES ($1, $2, $3, $4, 'ACTIVE', clock_timestamp())`,
      [randomUUID(), fixture.organizationId, fixture.locationId, actor.membershipId],
    );
  }
}
