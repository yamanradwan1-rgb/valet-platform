import { randomUUID } from "node:crypto";

import { generate } from "otplib";

import type { MfaAuthSession } from "./staff-mfa-test-fixture";
import { StaffMfaTestFixture } from "./staff-mfa-test-fixture";

export type ManagementTestRole =
  "ORG_ADMIN" | "LOCATION_MANAGER" | "VALET_SUPERVISOR" | "VALET_EMPLOYEE";

export interface ManagementMembershipFixture {
  readonly membershipId: string;
  readonly organizationId: string;
}

export interface ManagementLocationFixture {
  readonly locationId: string;
  readonly name: string;
  readonly status: "ACTIVE" | "INACTIVE";
}

export interface AssuredFactorFixture {
  readonly factorId: string;
  readonly secret: string;
}

export class ManagementControlPlaneTestFixture extends StaffMfaTestFixture {
  async createOrganization(
    options: { name?: string; status?: "ACTIVE" | "INACTIVE" } = {},
  ): Promise<string> {
    const organizationId = randomUUID();
    await this.query(
      `INSERT INTO organizations
         (id, name, status, timezone, updated_at)
       VALUES ($1, $2, $3, 'Asia/Amman', transaction_timestamp())`,
      [
        organizationId,
        options.name ?? `Management ${organizationId}`,
        options.status ?? "ACTIVE",
      ],
    );
    return organizationId;
  }

  async addMembership(
    organizationId: string,
    userId: string,
    role: ManagementTestRole,
    status: "ACTIVE" | "INACTIVE" = "ACTIVE",
  ): Promise<string> {
    const membershipId = randomUUID();
    await this.query(
      `INSERT INTO organization_memberships
         (id, organization_id, user_id, role, status, updated_at)
       VALUES ($1, $2, $3, $4, $5, transaction_timestamp())`,
      [membershipId, organizationId, userId, role, status],
    );
    return membershipId;
  }

  async createMembership(
    userId: string,
    options: {
      name?: string;
      organizationStatus?: "ACTIVE" | "INACTIVE";
      role?: ManagementTestRole;
      status?: "ACTIVE" | "INACTIVE";
    } = {},
  ): Promise<ManagementMembershipFixture> {
    const organizationId = await this.createOrganization({
      ...(options.name === undefined ? {} : { name: options.name }),
      ...(options.organizationStatus === undefined
        ? {}
        : { status: options.organizationStatus }),
    });
    const membershipId = await this.addMembership(
      organizationId,
      userId,
      options.role ?? "ORG_ADMIN",
      options.status,
    );
    return { membershipId, organizationId };
  }

  async addLocation(
    organizationId: string,
    options: {
      name?: string;
      status?: "ACTIVE" | "INACTIVE";
    } = {},
  ): Promise<ManagementLocationFixture> {
    const locationId = randomUUID();
    const name = options.name ?? `Location ${locationId}`;
    const status = options.status ?? "ACTIVE";
    await this.query(
      `INSERT INTO locations
         (id, organization_id, name, code, address_text, timezone, currency,
          status, updated_at)
       VALUES ($1, $2, $3, $4, 'Address', 'Asia/Amman', 'JOD', $5,
               transaction_timestamp())`,
      [locationId, organizationId, name, `L-${locationId}`, status],
    );
    return { locationId, name, status };
  }

  managementGet(path: string, accessToken: string) {
    return this.request(path, {
      authorization: `Bearer ${accessToken}`,
      method: "GET",
    });
  }

  managementPost(path: string, accessToken: string, body: unknown) {
    return this.request(path, {
      authorization: `Bearer ${accessToken}`,
      body,
      method: "POST",
    });
  }

  async enrollAndAssure(auth: MfaAuthSession): Promise<AssuredFactorFixture> {
    const begun = await this.postMfa(
      "/v1/staff/auth/mfa/enrollment/begin",
      auth.accessToken,
    );
    if (begun.status !== 200) {
      throw new Error(`MFA enrollment begin failed with ${begun.status}.`);
    }
    const factorId = String(begun.body?.factorId);
    const provisioning = begun.body?.provisioning as
      { readonly secretBase32?: unknown } | undefined;
    const secret = String(provisioning?.secretBase32);
    const code = await this.totp(secret);
    const confirmed = await this.postMfa(
      "/v1/staff/auth/mfa/enrollment/confirm",
      auth.accessToken,
      { code, factorId },
    );
    if (confirmed.status !== 200) {
      throw new Error(
        `MFA enrollment confirm failed with ${confirmed.status}.`,
      );
    }
    return { factorId, secret };
  }

  async stepUp(auth: MfaAuthSession, secret: string) {
    const code = await this.totp(secret, 1);
    return this.postMfa("/v1/staff/auth/mfa/step-up", auth.accessToken, {
      code,
    });
  }

  private async totp(secret: string, offset = 0): Promise<string> {
    const clock = await this.query<{ now: Date }>(
      `SELECT clock_timestamp() AS now`,
    );
    const step = Math.floor(clock.rows[0]!.now.getTime() / 1_000 / 30) + offset;
    return generate({
      algorithm: "sha1",
      digits: 6,
      epoch: step * 30,
      period: 30,
      secret,
      strategy: "totp",
    });
  }
}
